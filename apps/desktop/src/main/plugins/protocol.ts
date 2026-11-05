import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { protocol } from 'electron'
import { PLUGIN_SCHEME } from '@mjolnir/plugin-sdk'
import { isSafeRelativePath } from '@mjolnir/plugin-sdk/manifest'

export const PLUGIN_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
}

export function mimeType(file: string): string {
  return MIME_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
}

export function resolvePluginFile(url: string, rootFor: (pluginId: string) => string | null): string | null {
  let parsed: URL
  let path: string
  try {
    parsed = new URL(url)
    path = decodeURIComponent(parsed.pathname.slice(1))
  } catch {
    return null
  }
  if (parsed.protocol !== `${PLUGIN_SCHEME}:`) return null
  const root = rootFor(parsed.hostname)
  if (!root || !isSafeRelativePath(path)) return null
  return join(root, ...path.split('/'))
}

export function registerPluginScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: PLUGIN_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true } }])
}

export function servePlugins(rootFor: (pluginId: string) => string | null): void {
  protocol.handle(PLUGIN_SCHEME, async (request) => {
    const file = resolvePluginFile(request.url, rootFor)
    const content = file ? await readFile(file).catch(() => null) : null
    if (!file || !content) return new Response('Not found', { status: 404 })
    const type = mimeType(file)
    return new Response(content, {
      headers: {
        'Content-Type': type,
        'Content-Security-Policy': PLUGIN_CSP,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-cache',
        ...(type.startsWith('image/') && { 'Access-Control-Allow-Origin': '*' }),
      },
    })
  })
}

export function allowsFrameNavigation(currentUrl: string | undefined, targetUrl: string): boolean {
  let target: URL
  try {
    target = new URL(targetUrl)
  } catch {
    return false
  }
  if (target.href === 'about:blank') return true
  if (target.protocol !== `${PLUGIN_SCHEME}:`) return false
  const current = currentUrl ? URL.parse(currentUrl) : null
  return current?.protocol !== `${PLUGIN_SCHEME}:` || current.hostname === target.hostname
}
