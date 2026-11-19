import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState, UpdateStatus } from '../shared/updates'
import { openExternal } from './security'

const RELEASES_URL = 'https://github.com/Lautimb/mjolnir/releases'
const FIRST_CHECK_MS = 10_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
const BUSY: ReadonlySet<UpdateStatus['kind']> = new Set(['disabled', 'checking', 'downloading', 'ready'])

export class Updater {
  private status: UpdateStatus = app.isPackaged ? { kind: 'idle' } : { kind: 'disabled' }

  constructor(private readonly onChange: (state: UpdateState) => void) {}

  start(): void {
    if (this.status.kind === 'disabled') return
    // Squirrel.Mac only installs signed builds, so macOS gets a link to the release instead.
    autoUpdater.autoDownload = process.platform !== 'darwin'
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('checking-for-update', () => this.set({ kind: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ kind: 'latest' }))
    autoUpdater.on('update-available', ({ version }) =>
      this.set(autoUpdater.autoDownload ? { kind: 'downloading', version, percent: 0 } : { kind: 'available', version }),
    )
    autoUpdater.on('download-progress', ({ percent }) => {
      if (this.status.kind === 'downloading') this.set({ ...this.status, percent: Math.floor(percent) })
    })
    autoUpdater.on('update-downloaded', ({ version }) => this.set({ kind: 'ready', version }))
    autoUpdater.on('error', (error) => {
      console.error('[updater]', error)
      if (this.status.kind !== 'ready') this.set({ kind: 'error' })
    })
    setTimeout(() => this.check(), FIRST_CHECK_MS)
    setInterval(() => this.check(), CHECK_INTERVAL_MS)
  }

  state(): UpdateState {
    return { current: app.getVersion(), status: this.status }
  }

  check(): void {
    if (BUSY.has(this.status.kind)) return
    autoUpdater.checkForUpdates().catch(() => {})
  }

  apply(): void {
    if (this.status.kind === 'ready') autoUpdater.quitAndInstall(true, true)
    else if (this.status.kind === 'available') openExternal(`${RELEASES_URL}/tag/v${this.status.version}`)
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.onChange(this.state())
  }
}
