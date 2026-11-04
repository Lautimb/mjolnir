import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell, type BrowserWindowConstructorOptions } from 'electron'
import {
  createNodeDetectContext,
  detectProfiles,
  hostKey,
  hostHome,
  resolveLocation,
  spawnCommand,
  toNativePath,
  type CompareMode,
  type FileChange,
  type Host,
} from '@mjolnir/core'
import icon from '../../resources/icon.png?asset'
import type { SpawnRequest } from '../shared/api'
import { AppError } from '../shared/errors'
import { TITLEBAR_HEIGHT, type Settings } from '../shared/settings'
import { PtyManager } from './pty'
import { Store } from './store'
import { Workspace } from './workspace'

let mainWindow: BrowserWindow | null = null

const profiles = detectProfiles(createNodeDetectContext())
const appHost = resolveLocation(process.platform, process.env, app.getPath('home')).host
const repoHosts: Host[] =
  process.platform === 'win32'
    ? [...new Map(profiles.map((profile) => [hostKey(profile.host), profile.host])).values()]
    : [appHost]

const ptys = new PtyManager((channel, id, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, id, payload)
})

function windowChrome(): BrowserWindowConstructorOptions {
  if (process.platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#16171c', symbolColor: '#8d8f9a', height: TITLEBAR_HEIGHT },
    }
  }
  if (process.platform === 'darwin') return { titleBarStyle: 'hiddenInset' }
  return { frame: false }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    ...windowChrome(),
    width: 1360,
    height: 860,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: '#111216',
    title: 'Mjolnir',
    ...(process.platform === 'darwin' ? {} : { icon }),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      additionalArguments: [`--mjolnir-platform=${process.platform}`, `--mjolnir-host=${JSON.stringify(appHost)}`],
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  const sendMaximized = () => mainWindow?.webContents.send('window:maximized', mainWindow.isMaximized())
  mainWindow.on('maximize', sendMaximized)
  mainWindow.on('unmaximize', sendMaximized)

  mainWindow.on('closed', () => {
    ptys.killAll()
    mainWindow = null
  })
}

function registerIpc(workspace: Workspace, store: Store): void {
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:toggleMaximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('settings:get', () => store.settings())
  ipcMain.handle('settings:update', (_event, patch: Partial<Settings>) => store.updateSettings(patch))

  ipcMain.handle('profiles:list', () => profiles)

  ipcMain.handle('repos:list', () => workspace.repos())
  ipcMain.handle('repos:hosts', () => repoHosts)
  ipcMain.handle('repos:discover', (_event, host: Host) => workspace.discover(host))
  ipcMain.handle('repos:add', (_event, host: Host, path: string) => workspace.addRepo(host, path))
  ipcMain.handle('repos:browse', async (_event, host: Host, title: string) => {
    const home = toNativePath(process.platform, host, await hostHome(host))
    const result = await dialog.showOpenDialog(mainWindow!, {
      title,
      defaultPath: home,
      properties: ['openDirectory'],
    })
    const [folder] = result.filePaths
    return result.canceled || !folder ? null : workspace.addNativePath(folder)
  })
  ipcMain.handle('repos:remove', (_event, id: string) => workspace.removeRepo(id))
  ipcMain.handle('repos:branches', (_event, id: string) => workspace.branches(id))
  ipcMain.handle('repos:fetch', (_event, id: string) => workspace.fetch(id))

  ipcMain.handle('worktrees:list', (_event, repoId: string) => workspace.worktrees(repoId))
  ipcMain.handle('worktrees:create', (_event, repoId: string, branch: string, base: string) =>
    workspace.createWorktree(repoId, branch, base),
  )
  ipcMain.handle('worktrees:remove', (_event, repoId: string, path: string, force: boolean) =>
    workspace.removeWorktree(repoId, path, force),
  )
  ipcMain.handle('worktrees:changedFiles', (_event, repoId: string, path: string) =>
    workspace.changedFiles(repoId, path),
  )

  ipcMain.handle('diff:compare', (_event, repoId: string, path: string, mode: CompareMode) =>
    workspace.compare(repoId, path, mode),
  )
  ipcMain.handle('diff:file', (_event, repoId: string, path: string, from: string, change: FileChange) =>
    workspace.diffFile(repoId, path, from, change),
  )

  ipcMain.handle('pty:spawn', (_event, { id, profileId, cols, rows, cwd, initialInput }: SpawnRequest) => {
    const profile = profiles.find((p) => p.id === profileId)
    if (!profile) throw new AppError('unknownProfile', { id: profileId })
    ptys.spawn(id, spawnCommand(profile, cwd), cols, rows, initialInput)
  })
  ipcMain.on('pty:write', (_event, id: string, data: string) => ptys.write(id, data))
  ipcMain.on('pty:resize', (_event, id: string, cols: number, rows: number) => ptys.resize(id, cols, rows))
  ipcMain.on('pty:kill', (_event, id: string) => ptys.kill(id))
}

void app.whenReady().then(() => {
  const store = new Store(join(app.getPath('userData'), 'workspace.json'))
  registerIpc(new Workspace(store), store)
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
