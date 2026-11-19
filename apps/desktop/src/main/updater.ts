import { execFile } from 'node:child_process'
import { rmSync } from 'node:fs'
import { promisify } from 'node:util'
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState, UpdateStatus } from '../shared/updates'
import { readJson, writeJsonAtomic } from './json-file'
import { openExternal } from './security'

const RELEASES_URL = 'https://github.com/Lautimb/mjolnir/releases'
const FIRST_CHECK_MS = 10_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const BUSY: ReadonlySet<UpdateStatus['kind']> = new Set(['disabled', 'checking', 'downloading', 'ready'])

export interface InstallAttempt {
  from: string
  to: string
}

export function blockedInstall(attempt: unknown, current: string): string | null {
  if (!attempt || typeof attempt !== 'object') return null
  const { from, to } = attempt as Partial<InstallAttempt>
  return from === current && typeof to === 'string' ? to : null
}

const SMART_APP_CONTROL = ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy', '/v', 'VerifiedAndReputablePolicyState']

export function smartAppControlEnabled(regOutput: string): boolean {
  return /VerifiedAndReputablePolicyState\s+REG_DWORD\s+0x1\b/.test(regOutput)
}

async function blocksUnsignedInstallers(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  try {
    const { stdout } = await promisify(execFile)('reg', SMART_APP_CONTROL, { windowsHide: true })
    return smartAppControlEnabled(stdout)
  } catch {
    return false
  }
}

export class Updater {
  private status: UpdateStatus = app.isPackaged ? { kind: 'idle' } : { kind: 'disabled' }
  private blocked = false
  private downloadUrl: string | null = null
  private listening = false

  constructor(
    private readonly attemptFile: string,
    private readonly onChange: (state: UpdateState) => void,
  ) {}

  async start(): Promise<void> {
    if (this.status.kind === 'disabled') return
    const blockedVersion = blockedInstall(readJson(this.attemptFile), app.getVersion())
    if (blockedVersion) {
      this.blocked = true
      this.status = { kind: 'available', version: blockedVersion, blocked: true }
    } else {
      rmSync(this.attemptFile, { force: true })
    }
    // Squirrel.Mac and Smart App Control reject unsigned installers, and a blocked one would fail the same way on every quit.
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    const manual = process.platform === 'darwin' || this.blocked || (await blocksUnsignedInstallers())
    autoUpdater.autoDownload = !manual
    autoUpdater.autoInstallOnAppQuit = !manual
    autoUpdater.on('checking-for-update', () => this.set({ kind: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ kind: 'latest' }))
    autoUpdater.on('update-available', ({ version, files }) => {
      const file = process.platform === 'darwin' ? undefined : files[0]?.url
      this.downloadUrl = file ? `${RELEASES_URL}/download/v${version}/${encodeURIComponent(file)}` : null
      this.set(manual ? { kind: 'available', version, blocked: this.blocked } : { kind: 'downloading', version, percent: 0 })
    })
    autoUpdater.on('download-progress', ({ percent }) => {
      if (this.status.kind === 'downloading') this.set({ ...this.status, percent: Math.floor(percent) })
    })
    autoUpdater.on('update-downloaded', ({ version }) => {
      writeJsonAtomic(this.attemptFile, { from: app.getVersion(), to: version } satisfies InstallAttempt)
      this.set({ kind: 'ready', version })
    })
    autoUpdater.on('error', (error) => {
      console.error('[updater]', error)
      if (this.status.kind !== 'ready') this.set({ kind: 'error' })
    })
    this.listening = true
    setTimeout(() => this.check(), FIRST_CHECK_MS)
    setInterval(() => this.check(), CHECK_INTERVAL_MS)
  }

  state(): UpdateState {
    return { current: app.getVersion(), status: this.status }
  }

  check(): void {
    if (!this.listening || BUSY.has(this.status.kind)) return
    autoUpdater.checkForUpdates().catch(() => {})
  }

  apply(): void {
    if (this.status.kind === 'ready') autoUpdater.quitAndInstall(true, true)
    else if (this.status.kind === 'available') openExternal(this.downloadUrl ?? `${RELEASES_URL}/tag/v${this.status.version}`)
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.onChange(this.state())
  }
}
