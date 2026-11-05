import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isAppUrl, isExternalUrl, rendererEntry } from './security'

describe('isAppUrl', () => {
  it('trusts only the bundled renderer entry when there is no dev server', () => {
    expect(isAppUrl(pathToFileURL(rendererEntry).href, '')).toBe(true)
    expect(isAppUrl(`${pathToFileURL(rendererEntry).href}#/settings`, '')).toBe(true)
    expect(isAppUrl(pathToFileURL('/tmp/evil.html').href, '')).toBe(false)
    expect(isAppUrl('https://github.com', '')).toBe(false)
  })

  it('trusts only the dev server origin while developing', () => {
    expect(isAppUrl('http://localhost:5173/index.html', 'http://localhost:5173')).toBe(true)
    expect(isAppUrl('http://localhost:5174/', 'http://localhost:5173')).toBe(false)
    expect(isAppUrl(pathToFileURL(rendererEntry).href, 'http://localhost:5173')).toBe(false)
  })
})

describe('isExternalUrl', () => {
  it('opens only web links, never local files or protocol handlers', () => {
    expect(isExternalUrl('https://github.com/Lautimb/mjolnir/pull/3')).toBe(true)
    expect(isExternalUrl('http://localhost:3000')).toBe(true)
    expect(isExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isExternalUrl('ms-msdt:/id PCWDiagnostic')).toBe(false)
    expect(isExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalUrl('not a url')).toBe(false)
  })
})
