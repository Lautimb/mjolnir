import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { catalogEntry, signEntry, verifyEntry } from './catalog.mjs'

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

const entry = { id: 'hello', version: '1.0.0', sha256: 'a'.repeat(64) }

describe('catalog signatures', () => {
  it('verifies an entry signed with any of the trusted keys', () => {
    const current = keys()
    const signature = signEntry(entry, current.privateKeyPem)
    expect(verifyEntry(entry, signature, [keys().publicKey, current.publicKey])).toBe(true)
    expect(verifyEntry(entry, signature, [keys().publicKey])).toBe(false)
  })

  it('binds the signature to the version, so an old signed package cannot pass as a new one', () => {
    const { publicKey, privateKeyPem } = keys()
    const signature = signEntry(entry, privateKeyPem)
    expect(verifyEntry({ ...entry, version: '2.0.0' }, signature, [publicKey])).toBe(false)
    expect(verifyEntry({ ...entry, sha256: 'b'.repeat(64) }, signature, [publicKey])).toBe(false)
  })
})

describe('catalogEntry', () => {
  it('describes the package with only the strings the manifest uses', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mjolnir-entry-'))
    mkdirSync(join(dir, 'locales'))
    writeFileSync(join(dir, 'mjolnir-plugin.json'), JSON.stringify({ id: 'hello', version: '1.0.0', name: '%name%', locales: { es: 'locales/es.json' } }))
    writeFileSync(join(dir, 'locales', 'es.json'), JSON.stringify({ name: 'Hola', other: 'x' }))
    const file = join(dir, 'hello.mjp')
    writeFileSync(file, 'zip')
    const { publicKey, privateKeyPem } = keys()
    const result = await catalogEntry({ dir, file, url: 'https://github.com/o/r/releases/download/v1/hello.mjp', privateKeyPem })
    expect(result).toMatchObject({ id: 'hello', version: '1.0.0', size: 3, strings: { es: { name: 'Hola' } } })
    expect(verifyEntry(result, result.signature!, [publicKey])).toBe(true)
  })
})
