import { join } from 'node:path'
import { BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import type { Host } from '@mjolnir/core'
import icon from '../../resources/icon.png?asset'
import { TITLEBAR_HEIGHT } from '../shared/settings'
import { zoomShortcut, type ZoomDirection } from '../shared/zoom'
import { rendererEntry } from './security'

function chrome(): BrowserWindowConstructorOptions {
  if (process.platform === 'win32') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#16171c', symbolColor: '#8d8f9a', height: TITLEBAR_HEIGHT },
      icon,
    }
  }
  if (process.platform === 'darwin') return { titleBarStyle: 'hiddenInset' }
  return { frame: false, icon }
}

export interface WindowZoom {
  current(): number
  change(direction: ZoomDirection): void
}

export class MainWindow {
  private window: BrowserWindow | null = null

  constructor(
    private readonly appHost: Host,
    private readonly zoom: WindowZoom,
    private readonly onClosed: () => void,
  ) {}

  get current(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null
  }

  open(): void {
    if (this.current) return
    const window = new BrowserWindow({
      ...chrome(),
      width: 1360,
      height: 860,
      minWidth: 760,
      minHeight: 480,
      backgroundColor: '#111216',
      title: 'Mjolnir',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        additionalArguments: [`--mjolnir-platform=${process.platform}`, `--mjolnir-host=${JSON.stringify(this.appHost)}`],
      },
    })

    window.webContents.on('did-finish-load', () => window.webContents.setZoomFactor(this.zoom.current()))
    window.webContents.on('before-input-event', (event, input) => {
      const direction = zoomShortcut(input, process.platform)
      if (!direction) return
      event.preventDefault()
      this.zoom.change(direction)
    })
    window.webContents.on('zoom-changed', (_event, direction) => this.zoom.change(direction))

    const sendMaximized = () => this.send('window:maximized', window.isMaximized())
    window.on('maximize', sendMaximized)
    window.on('unmaximize', sendMaximized)
    window.on('closed', () => {
      this.window = null
      this.onClosed()
    })

    if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    else void window.loadFile(rendererEntry)
    this.window = window
  }

  send(channel: string, ...args: unknown[]): void {
    this.current?.webContents.send(channel, ...args)
  }

  setZoom(factor: number): void {
    this.current?.webContents.setZoomFactor(factor)
  }

  minimize(): void {
    this.current?.minimize()
  }

  toggleMaximize(): void {
    const window = this.current
    if (window?.isMaximized()) window.unmaximize()
    else window?.maximize()
  }

  close(): void {
    this.current?.close()
  }

  isMaximized(): boolean {
    return this.current?.isMaximized() ?? false
  }
}
