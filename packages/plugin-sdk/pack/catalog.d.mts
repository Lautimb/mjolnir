export interface SignedFields {
  id: string
  version: string
  sha256: string
}

export interface CatalogEntry extends SignedFields {
  url: string
  size: number
  manifest: unknown
  strings: Record<string, Record<string, string>>
  signature?: string
}

export function signedMessage(entry: SignedFields): Buffer

export function signEntry(entry: SignedFields, privateKeyPem: string): string

export function verifyEntry(entry: SignedFields, signature: string, publicKeys: readonly string[]): boolean

export function catalogEntry(options: { dir: string; file: string; url: string; privateKeyPem?: string }): Promise<CatalogEntry>
