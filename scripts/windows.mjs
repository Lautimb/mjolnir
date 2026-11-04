import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import path from 'node:path'

const mode = process.argv[2]
if (!['dev', 'app', 'package'].includes(mode)) {
  console.error('Uso: node scripts/windows.mjs <dev|app|package>')
  process.exit(1)
}
if (!process.env.WSL_DISTRO_NAME) {
  console.error('Este script se corre desde WSL. En Windows usá `pnpm dev` o `pnpm --filter @mjolnir/desktop package`.')
  process.exit(1)
}

const root = path.resolve(import.meta.dirname, '..')
const EXCLUDES = ['node_modules', 'out', 'dist', 'release', '.git', '.install-hash']
const WINDOWS_CWD = '/mnt/c'

const windows = (command, options = {}) =>
  spawn('cmd.exe', ['/c', `cd /d ${winTarget} && set COREPACK_ENABLE_DOWNLOAD_PROMPT=0&& ${command}`], {
    cwd: WINDOWS_CWD,
    stdio: 'inherit',
    ...options,
  })

const localAppData = execFileSync('cmd.exe', ['/c', 'echo %LOCALAPPDATA%'], { cwd: WINDOWS_CWD, encoding: 'utf8' }).trim()
const winTarget = `${localAppData}\\mjolnir-dev`
const target = execFileSync('wslpath', ['-u', winTarget], { encoding: 'utf8' }).trim()

function sync() {
  execFileSync('rsync', ['-rt', '--delete', ...EXCLUDES.flatMap((e) => ['--exclude', e]), `${root}/`, `${target}/`], {
    stdio: 'inherit',
  })
}

function workspacePackages() {
  return ['apps', 'packages', 'plugins']
    .filter((dir) => existsSync(path.join(root, dir)))
    .flatMap((dir) => readdirSync(path.join(root, dir)).map((name) => path.join(dir, name)))
}

function manifests() {
  return ['package.json', ...workspacePackages().map((dir) => path.join(dir, 'package.json'))].filter((file) =>
    existsSync(path.join(root, file)),
  )
}

function installIfNeeded() {
  const hash = createHash('sha256')
  for (const file of ['pnpm-lock.yaml', ...manifests()]) hash.update(readFileSync(path.join(root, file)))
  const digest = hash.digest('hex')
  const marker = path.join(target, '.install-hash')
  if (existsSync(marker) && readFileSync(marker, 'utf8') === digest) return Promise.resolve()

  console.log(`[windows] instalando dependencias en ${winTarget}…`)
  return new Promise((resolve, reject) => {
    windows('corepack pnpm install --frozen-lockfile').on('exit', (code) => {
      if (code !== 0) return reject(new Error(`pnpm install salió con código ${code}`))
      writeFileSync(marker, digest)
      resolve()
    })
  })
}

function watchSources(onChange) {
  const packages = workspacePackages().map((dir) => path.join(root, dir))

  const watchers = [root, ...packages].map((dir) => watch(dir, onChange))
  for (const dir of packages) {
    const src = path.join(dir, 'src')
    if (existsSync(src)) watchers.push(watch(src, { recursive: true }, onChange))
  }
  return () => watchers.forEach((w) => w.close())
}

function killWindowsProcesses() {
  const pattern = `*${winTarget}*`.replaceAll("'", "''")
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '${pattern}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      ],
      { cwd: WINDOWS_CWD, stdio: 'ignore' },
    )
  } catch {}
}

console.log(`[windows] sincronizando a ${winTarget}`)
sync()
await installIfNeeded()

function installApp() {
  const script = `
$ErrorActionPreference = 'Stop'
$source = '${winTarget}'
$dest = Join-Path $env:LOCALAPPDATA 'Programs\\Mjolnir'
$resources = "$source\\apps\\desktop\\release\\win-unpacked\\resources"
Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$dest*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
robocopy "$source\\node_modules\\electron\\dist" "$dest\\runtime" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy $resources "$dest\\app" app.asar /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy "$resources\\app.asar.unpacked" "$dest\\app\\app.asar.unpacked" /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath('Programs')) 'Mjolnir.lnk'))
$shortcut.TargetPath = "$dest\\runtime\\electron.exe"
$shortcut.Arguments = '"' + "$dest\\app\\app.asar" + '"'
$shortcut.WorkingDirectory = $dest
Copy-Item "$source\\apps\\desktop\\resources\\icon.ico" "$dest\\icon.ico" -Force
$shortcut.IconLocation = "$dest\\icon.ico"
$shortcut.Save()
Write-Output "$dest"
`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', encoded], { cwd: WINDOWS_CWD, encoding: 'utf8' }).trim()
}

if (mode === 'app') {
  windows('corepack pnpm --filter @mjolnir/desktop package:dir').on('exit', (code) => {
    if (code !== 0) process.exit(code ?? 1)
    const dest = installApp()
    console.log(`[windows] Mjolnir instalado en ${dest}. Abrilo desde el menú Inicio.`)
    process.exit(0)
  })
} else if (mode === 'package') {
  windows('corepack pnpm --filter @mjolnir/desktop package').on('exit', (code) => {
    if (code !== 0) process.exit(code ?? 1)
    const release = `${winTarget}\\apps\\desktop\\release`
    console.log(`[windows] instalador listo en ${release}`)
    spawn('explorer.exe', [release], { cwd: WINDOWS_CWD, stdio: 'ignore' }).on('exit', () => process.exit(0))
  })
} else {
  let timer
  const stopWatching = watchSources((_event, file) => {
    if (file && EXCLUDES.some((e) => file.split(/[\\/]/).includes(e))) return
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        sync()
      } catch (error) {
        console.error('[windows] falló la sincronización:', error.message)
      }
    }, 150)
  })

  const dev = windows('corepack pnpm --filter @mjolnir/desktop dev')

  const shutdown = () => {
    stopWatching()
    killWindowsProcesses()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  dev.on('exit', shutdown)
}
