import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, session, shell, type WebContents, type WebFrameMain } from 'electron'
import { allowsFrameNavigation } from './plugins/protocol'

const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:'])
const ALLOWED_PERMISSIONS = new Set(['clipboard-sanitized-write'])

export const rendererEntry = join(__dirname, '../renderer/index.html')

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

export function isAppUrl(url: string, devServer = process.env.ELECTRON_RENDERER_URL): boolean {
  const parsed = parse(url)
  if (!parsed) return false
  if (devServer) return parsed.origin === parse(devServer)?.origin
  return parsed.protocol === 'file:' && fileURLToPath(parsed) === rendererEntry
}

export function isTrustedSender(frame: WebFrameMain | null | undefined): boolean {
  return !!frame && frame === frame.top && isAppUrl(frame.url)
}

export function isExternalUrl(url: string): boolean {
  const parsed = parse(url)
  return !!parsed && EXTERNAL_PROTOCOLS.has(parsed.protocol)
}

export function openExternal(url: string): void {
  if (isExternalUrl(url)) void shell.openExternal(url)
}

function lockDown(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })
  contents.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame && !allowsFrameNavigation(event.frame?.url, event.url)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
}

export function hardenApp(): void {
  app.on('web-contents-created', (_event, contents) => lockDown(contents))
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)))
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => ALLOWED_PERMISSIONS.has(permission))
}
