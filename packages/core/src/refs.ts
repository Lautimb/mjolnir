const UNSAFE_REF = /^[-+/.]|[\0-\x20\x7f~^:?*[\\]|\.\.|@\{|\/\/|[/.]$|\.lock$/

export class UnsafeRefError extends Error {
  constructor(readonly ref: string) {
    super(`Unsafe git ref: ${JSON.stringify(ref)}`)
  }
}

export function isSafeRef(ref: string): boolean {
  return ref.length > 0 && ref.length <= 255 && !UNSAFE_REF.test(ref)
}

export function safeRef(ref: string): string {
  if (!isSafeRef(ref)) throw new UnsafeRefError(ref)
  return ref
}
