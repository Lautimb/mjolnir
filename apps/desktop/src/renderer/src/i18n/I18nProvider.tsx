import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Host } from '@mjolnir/core/browser'
import { parseAppError } from '../../../shared/errors'
import { resolveLocale, type LanguagePreference, type LocaleId } from '../../../shared/locales'
import { LOCALES, sourceMessages, type MessageKey, type Messages } from './catalog'
import { createTranslator, type Translate } from './translator'

export type T = Translate<typeof sourceMessages>

interface I18n {
  locale: LocaleId
  t: T
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ preference, children }: { preference: LanguagePreference; children: ReactNode }) {
  const locale = resolveLocale(preference, navigator.languages)
  const [loaded, setLoaded] = useState<{ locale: LocaleId; messages: Messages } | null>(null)

  useEffect(() => {
    let cancelled = false
    void LOCALES[locale].load().then((messages) => !cancelled && setLoaded({ locale, messages }))
    document.documentElement.lang = locale
    return () => {
      cancelled = true
    }
  }, [locale])

  const value = useMemo(
    () => loaded && { locale: loaded.locale, t: createTranslator(loaded.locale, loaded.messages, sourceMessages) },
    [loaded],
  )

  return value ? <I18nContext.Provider value={value}>{children}</I18nContext.Provider> : null
}

export function useI18n(): I18n {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}

export function hostLabel(t: T, host: Host): string {
  if (host.kind === 'wsl') return t('hosts.wsl', { distro: host.distro })
  return host.kind === 'windows' ? t('hosts.windows') : t('hosts.local')
}

export function describeError(t: T, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const coded = parseAppError(raw)
  if (coded) {
    const key: MessageKey = `errors.${coded.code}`
    return (t as (key: MessageKey, params: object) => string)(key, coded.params)
  }
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
