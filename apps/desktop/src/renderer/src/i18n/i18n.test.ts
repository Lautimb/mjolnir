import { describe, expect, it } from 'vitest'
import { AppError, parseAppError } from '../../../shared/errors'
import { LOCALE_IDS, resolveLocale } from '../../../shared/locales'
import { LOCALES, sourceMessages } from './catalog'
import { createTranslator } from './translator'
import { plural, type Message, type MessageTree } from './types'

const source = {
  greeting: 'Hola {name}',
  files: plural({ one: '{count} archivo', other: '{count} archivos' }),
  nested: { only: 'solo en el origen' },
} as const

function leaves(tree: MessageTree, prefix = ''): Map<string, Message> {
  const entries = Object.entries(tree).flatMap(([key, node]): [string, Message][] =>
    typeof node === 'string' || ('kind' in node && node.kind === 'plural')
      ? [[`${prefix}${key}`, node as Message]]
      : [...leaves(node as MessageTree, `${prefix}${key}.`)],
  )
  return new Map(entries)
}

function placeholders(message: Message): string[] {
  const texts = typeof message === 'string' ? [message] : Object.values(message.forms)
  return [...new Set(texts.flatMap((text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!)))].sort()
}

describe('createTranslator', () => {
  const t = createTranslator('es', source, source)

  it('interpolates params and formats numbers for the locale', () => {
    expect(t('greeting', { name: 'Lauti' })).toBe('Hola Lauti')
    expect(createTranslator('es', source, source)('files', { count: 15000 })).toBe('15.000 archivos')
    expect(createTranslator('en', source, source)('files', { count: 15000 })).toBe('15,000 archivos')
  })

  it('picks the plural form with the locale rules, beyond one/other', () => {
    const ru = createTranslator('ru', { files: plural({ one: '{count} файл', few: '{count} файла', many: '{count} файлов', other: '{count} файла' }) }, source)
    expect([1, 3, 5].map((count) => ru('files', { count }))).toEqual(['1 файл', '3 файла', '5 файлов'])
  })

  it('falls back to the source catalog for keys a translation is missing, and to the key itself as a last resort', () => {
    const partial = createTranslator('en', { greeting: 'Hi {name}' }, source)
    expect(partial('nested.only')).toBe('solo en el origen')
    expect((partial as (key: string) => string)('does.not.exist')).toBe('does.not.exist')
  })

  it('rejects unknown keys and missing params at compile time', () => {
    // @ts-expect-error unknown key
    t('greting')
    // @ts-expect-error missing the name param
    t('greeting')
    // @ts-expect-error plurals require count
    t('files', {})
  })
})

describe('resolveLocale', () => {
  it('uses the explicit preference, then the first supported system language, then English', () => {
    expect(resolveLocale('en', ['es-AR'])).toBe('en')
    expect(resolveLocale('system', ['es-AR', 'en-US'])).toBe('es')
    expect(resolveLocale('system', ['fr-FR', 'en-GB'])).toBe('en')
    expect(resolveLocale('system', ['fr-FR'])).toBe('en')
  })
})

describe('locale catalogs', () => {
  const sourceLeaves = leaves(sourceMessages)

  it.each(LOCALE_IDS)('%s has every source key with the same placeholders', async (id) => {
    const translated = leaves(await LOCALES[id].load())
    expect([...translated.keys()].sort()).toEqual([...sourceLeaves.keys()].sort())
    for (const [key, message] of sourceLeaves) {
      expect({ key, placeholders: placeholders(translated.get(key)!) }).toEqual({ key, placeholders: placeholders(message) })
    }
  })
})

describe('AppError', () => {
  it('survives the prefix Electron adds when an IPC handler throws', () => {
    const error = new AppError('unknownRepo', { id: 'abc' })
    expect(parseAppError(`Error invoking remote method 'x': Error: ${error.message}`)).toEqual({
      code: 'unknownRepo',
      params: { id: 'abc' },
    })
    expect(parseAppError('fatal: not a git repository')).toBeNull()
  })
})
