import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allowsFrameNavigation, mimeType, resolvePluginFile } from './protocol'

const roots: Record<string, string> = { hello: '/plugins/hello' }
const rootFor = (id: string) => roots[id] ?? null

describe('resolvePluginFile', () => {
  it('maps the host to the plugin folder and the path to a file inside it', () => {
    expect(resolvePluginFile('mjolnir-plugin://hello/assets/index.js?r=2', rootFor)).toBe(join('/plugins/hello', 'assets', 'index.js'))
  })

  it('serves nothing for plugins that are not active', () => {
    expect(resolvePluginFile('mjolnir-plugin://other/index.html', rootFor)).toBeNull()
  })

  it('never resolves outside the plugin folder, however the path is encoded', () => {
    for (const path of ['/..%2f..%2fsecrets.json', '/a%5c..%5c..%5cx', '/', '/a//b']) {
      expect(resolvePluginFile(`mjolnir-plugin://hello${path}`, rootFor)).toBeNull()
    }
    expect(resolvePluginFile('mjolnir-plugin://hello/%2e%2e/%2e%2e/x', rootFor)).toBe(join('/plugins/hello', 'x'))
  })
})

describe('mimeType', () => {
  it('serves module scripts with a JavaScript type, which Chromium requires', () => {
    expect(mimeType('assets/index.js')).toMatch(/^text\/javascript/)
    expect(mimeType('a.unknown')).toBe('application/octet-stream')
  })
})

describe('allowsFrameNavigation', () => {
  it('lets the app load a plugin into a new frame and the plugin move within its own origin', () => {
    expect(allowsFrameNavigation('', 'mjolnir-plugin://hello/index.html')).toBe(true)
    expect(allowsFrameNavigation('mjolnir-plugin://hello/index.html', 'mjolnir-plugin://hello/other.html')).toBe(true)
  })

  it('blocks plugin frames from leaving their origin, which would let them leak data in the url', () => {
    expect(allowsFrameNavigation('mjolnir-plugin://hello/index.html', 'https://evil.io/?token=x')).toBe(false)
    expect(allowsFrameNavigation('mjolnir-plugin://hello/index.html', 'mjolnir-plugin://other/index.html')).toBe(false)
    expect(allowsFrameNavigation('', 'https://evil.io/')).toBe(false)
    expect(allowsFrameNavigation('', 'javascript:alert(1)')).toBe(false)
  })
})
