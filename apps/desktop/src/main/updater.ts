import { rmSync } from 'node:fs'
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

export class Updater {
  private status: UpdateStatus = app.isPackaged ? { kind: 'idle' } : { kind: 'disabled' }
  private blocked = false

  constructor(
    private readonly attemptFile: string,
    private readonly onChange: (state: UpdateState) => void,
  ) {}

  start(): void {
    if (this.status.kind === 'disabled') return
    const blockedVersion = blockedInstall(readJson(this.attemptFile), app.getVersion())
    if (blockedVersion) {
      this.blocked = true
      this.status = { kind: 'available', version: blockedVersion, blocked: true }
    } else {
      rmSync(this.attemptFile, { force: true })
    }
    // Squirrel.Mac only installs signed builds, and a blocked installer would fail the same way on every quit.
    const manual = process.platform === 'darwin' || this.blocked
    autoUpdater.autoDownload = !manual
    autoUpdater.autoInstallOnAppQuit = !manual
    autoUpdater.on('checking-for-update', () => this.set({ kind: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ kind: 'latest' }))
    autoUpdater.on('update-available', ({ version }) =>
      this.set(manual ? { kind: 'available', version, blocked: this.blocked } : { kind: 'downloading', version, percent: 0 }),
    )
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
