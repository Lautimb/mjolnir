import type { LocaleId } from '../../../shared/locales'
import { es } from './locales/es'
import type { Catalog, KeyOf } from './types'

export type Messages = Catalog<typeof es>

export type MessageKey = KeyOf<typeof es>

interface LocaleDefinition {
  nativeName: string
  load(): Promise<Messages>
}

export const LOCALES = {
  es: { nativeName: 'Español', load: async () => es },
  en: { nativeName: 'English', load: async () => (await import('./locales/en')).en },
} satisfies Record<LocaleId, LocaleDefinition>

export { es as sourceMessages }
