import { describe, expect, it } from 'vitest'
import { createZip } from '@mjolnir/plugin-sdk/pack'
import { readPackage } from './package'

const zip = (files: Record<string, string>) => createZip(Object.entries(files).map(([name, content]) => [name, Buffer.from(content)]))

const CENTRAL = Buffer.from([0x50, 0x4b, 0x01, 0x02])

function patchCentral(buffer: Buffer, patch: (offset: number, copy: Buffer) => void): Buffer {
  const copy = Buffer.from(buffer)
  patch(copy.indexOf(CENTRAL), copy)
  return copy
}

describe('readPackage', () => {
  it('reads the files of a package made by the SDK packer, with its hash', () => {
    const { files, sha256 } = readPackage(zip({ 'mjolnir-plugin.json': '{"id":"x"}', 'assets/index.js': 'console.log(1)' }))
    expect([...files.keys()]).toEqual(['mjolnir-plugin.json', 'assets/index.js'])
    expect(files.get('assets/index.js')!.toString()).toBe('console.log(1)')
    expect(sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects paths that would land outside the plugin folder', () => {
    for (const name of ['../evil.js', '/etc/passwd', 'a\\..\\b.js', 'C:/x.js', 'a//b.js']) {
      expect(() => readPackage(zip({ [name]: 'x' })), name).toThrow(/unsafe path/)
    }
  })

  it('rejects symbolic links, encrypted entries and duplicates', () => {
    const base = zip({ 'link.js': '/etc/passwd' })
    const symlink = patchCentral(base, (at, copy) => copy.writeUInt32LE((0o120777 << 16) >>> 0, at + 38))
    expect(() => readPackage(symlink)).toThrow(/symbolic links/)
    const encrypted = patchCentral(base, (at, copy) => copy.writeUInt16LE(0x0801, at + 8))
    expect(() => readPackage(encrypted)).toThrow(/encrypted/)
    const twice = createZip([
      ['a.js', Buffer.from('1')],
      ['a.js', Buffer.from('2')],
    ])
    expect(() => readPackage(twice)).toThrow(/duplicated/)
  })

  it('does not inflate past the declared size, so a zip bomb cannot exhaust memory', () => {
    const bomb = patchCentral(zip({ 'big.js': 'x'.repeat(1_000_000) }), (at, copy) => copy.writeUInt32LE(10, at + 24))
    expect(() => readPackage(bomb)).toThrow(/corrupt data/)
    expect(() => readPackage(zip({ 'big.js': 'x'.repeat(2000) }), { packageBytes: 1e6, fileBytes: 1000, totalBytes: 1e6, entries: 10 })).toThrow(/larger than/)
  })

  it('detects corrupted content and things that are not zips', () => {
    const corrupt = patchCentral(zip({ 'a.js': 'hello' }), (at, copy) => copy.writeUInt32LE(0, at + 16))
    expect(() => readPackage(corrupt)).toThrow(/corrupt data/)
    expect(() => readPackage(Buffer.from('not a zip at all, just some text to make it long enough'))).toThrow(/not a zip/)
  })
})
