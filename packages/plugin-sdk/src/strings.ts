export const LOCALIZED = /^%([\w.-]+)%$/

export function localize(value: string, strings: Record<string, string>): string {
  const key = LOCALIZED.exec(value)?.[1]
  return key === undefined ? value : (strings[key] ?? key)
}
