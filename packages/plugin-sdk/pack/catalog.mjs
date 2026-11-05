import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const LOCALIZED = /^%([\w.-]+)%$/

export function signedMessage(entry) {
  return Buffer.from(`mjolnir-plugin-catalog:1\n${entry.id}\n${entry.version}\n${entry.sha256}`, 'utf8')
}

export function signEntry(entry, privateKeyPem) {
  return sign(null, signedMessage(entry), createPrivateKey(privateKeyPem)).toString('base64')
}

export function verifyEntry(entry, signature, publicKeys) {
  const bytes = Buffer.from(signature, 'base64')
  return publicKeys.some((key) => verify(null, signedMessage(entry), createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' }), bytes))
}

function localizedKeys(manifest) {
  const texts = [
    manifest.name,
    manifest.description ?? '',
    ...(manifest.contributes?.views ?? []).map((view) => view.title),
    ...(manifest.contributes?.providers ?? []).map((provider) => provider.displayName),
  ]
  return new Set(texts.flatMap((text) => LOCALIZED.exec(text)?.[1] ?? []))
}

async function readStrings(dir, manifest) {
  const keys = localizedKeys(manifest)
  if (!keys.size) return {}
  const entries = await Promise.all(
    Object.entries(manifest.locales ?? {}).map(async ([locale, file]) => {
      const raw = JSON.parse(await readFile(join(dir, file), 'utf8'))
      return [locale, Object.fromEntries(Object.entries(raw).filter(([key, value]) => keys.has(key) && typeof value === 'string'))]
    }),
  )
  return Object.fromEntries(entries)
}

export async function catalogEntry({ dir, file, url, privateKeyPem }) {
  const manifest = JSON.parse(await readFile(join(dir, 'mjolnir-plugin.json'), 'utf8'))
  const zip = await readFile(file)
  const base = { id: manifest.id, version: manifest.version, sha256: createHash('sha256').update(zip).digest('hex') }
  return {
    ...base,
    url,
    size: (await stat(file)).size,
    manifest,
    strings: await readStrings(dir, manifest),
    ...(privateKeyPem ? { signature: signEntry(base, privateKeyPem) } : {}),
  }
}
