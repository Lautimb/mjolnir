import type { ArgsFor, KeyOf, Message, MessageTree, Plural } from './types'

export type Translate<T> = <K extends KeyOf<T>>(key: K, ...args: ArgsFor<T, K>) => string

function isMessage(node: unknown): node is Message {
  return typeof node === 'string' || (typeof node === 'object' && node !== null && (node as Plural).kind === 'plural')
}

function lookup(tree: MessageTree, key: string): Message | undefined {
  const node = key
    .split('.')
    .reduce<unknown>((current, part) => (current && !isMessage(current) ? (current as MessageTree)[part] : undefined), tree)
  return isMessage(node) ? node : undefined
}

export function createTranslator<T extends MessageTree>(locale: string, messages: MessageTree, fallback: T): Translate<T> {
  const plurals = new Intl.PluralRules(locale)
  const numbers = new Intl.NumberFormat(locale)

  return ((key: string, params: Record<string, string | number> = {}) => {
    const message = lookup(messages, key) ?? lookup(fallback, key)
    if (message === undefined) return key
    const template =
      typeof message === 'string' ? message : (message.forms[plurals.select(Number(params.count))] ?? message.forms.other)
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
      const value = params[name]
      if (value === undefined) return placeholder
      return typeof value === 'number' ? numbers.format(value) : value
    })
  }) as Translate<T>
}
