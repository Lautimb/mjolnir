export const LOCALE_IDS = ['es', 'en'] as const

export type LocaleId = (typeof LOCALE_IDS)[number]

export type LanguagePreference = LocaleId | 'system'

export const SOURCE_LOCALE: LocaleId = 'es'

export const FALLBACK_LOCALE: LocaleId = 'en'

export function resolveLocale(preference: LanguagePreference, systemLocales: readonly string[]): LocaleId {
  if (preference !== 'system') return preference
  for (const tag of systemLocales) {
    const language = tag.toLowerCase().split('-')[0]
    const match = LOCALE_IDS.find((id) => id === language)
    if (match) return match
  }
  return FALLBACK_LOCALE
}
