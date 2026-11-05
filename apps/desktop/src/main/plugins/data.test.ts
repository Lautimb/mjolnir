import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PluginData, STORAGE_LIMITS } from './data'

const cipher = { encrypt: (value: string) => `enc:${value}`, decrypt: (value: string) => value.replace(/^enc:/, '') }

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'mjolnir-plugin-data-'))
  return { dir, data: new PluginData(dir, cipher) }
}

afterEach(() => vi.useRealTimers())

describe('PluginData', () => {
  it('keeps each plugin in its own folder', () => {
    const { dir, data } = setup()
    data.for('a').storage.set('key', 1)
    data.for('b').storage.set('key', 2)
    data.flush()
    expect(JSON.parse(readFileSync(join(dir, 'a', 'storage.json'), 'utf8'))).toEqual({ key: 1 })
    expect(JSON.parse(readFileSync(join(dir, 'b', 'storage.json'), 'utf8'))).toEqual({ key: 2 })
    expect(new PluginData(dir, cipher).for('a').storage.get('key')).toBe(1)
  })

  it('batches writes instead of hitting the disk on every set', () => {
    vi.useFakeTimers()
    const { dir, data } = setup()
    const storage = data.for('a').storage
    for (let count = 0; count < 100; count++) storage.set('counter', count)
    expect(() => readFileSync(join(dir, 'a', 'storage.json'))).toThrow()
    vi.runAllTimers()
    expect(JSON.parse(readFileSync(join(dir, 'a', 'storage.json'), 'utf8'))).toEqual({ counter: 99 })
  })

  it('stores secrets only encrypted', () => {
    const { dir, data } = setup()
    data.for('a').secrets.set('token', 'pat-123')
    data.flush()
    expect(readFileSync(join(dir, 'a', 'secrets.json'), 'utf8')).toContain('enc:pat-123')
    expect(new PluginData(dir, cipher).for('a').secrets.get('token')).toBe('pat-123')
  })

  it('enforces the quota, counting overwrites only once', () => {
    const { data } = setup()
    const storage = data.for('a').storage
    const chunk = 'x'.repeat(STORAGE_LIMITS.valueBytes - 10)
    expect(() => storage.set('big', 'x'.repeat(STORAGE_LIMITS.valueBytes))).toThrow(expect.objectContaining({ code: 'quotaExceeded' }))
    for (let index = 0; index < 9; index++) storage.set(`k${index}`, chunk)
    storage.set('k0', chunk)
    expect(() => storage.set('k9', chunk)).not.toThrow()
    expect(() => storage.set('k10', chunk)).toThrow(expect.objectContaining({ code: 'quotaExceeded' }))
    storage.delete('k0')
    expect(() => storage.set('k10', chunk)).not.toThrow()
  })
})
