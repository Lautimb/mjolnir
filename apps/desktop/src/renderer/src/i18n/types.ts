export type PluralCategory = Intl.LDMLPluralRule

export type PluralForms = { readonly other: string } & { readonly [C in Exclude<PluralCategory, 'other'>]?: string }

export interface Plural<F extends PluralForms = PluralForms> {
  readonly kind: 'plural'
  readonly forms: F
}

export function plural<const F extends PluralForms>(forms: F): Plural<F> {
  return { kind: 'plural', forms }
}

export type Message = string | Plural

export type MessageTree = { readonly [key: string]: Message | MessageTree }

export type Catalog<T> = { readonly [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : Catalog<T[K]> }

export type KeyOf<T> = {
  [K in keyof T & string]: T[K] extends Message ? K : `${K}.${KeyOf<T[K]>}`
}[keyof T & string]

type MessageAt<T, K extends string> = K extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? MessageAt<T[Head], Rest>
    : never
  : K extends keyof T
    ? T[K]
    : never

type Placeholders<S> = S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never

type ParamsOf<M> =
  M extends Plural<infer F>
    ? { count: number } & { [P in Exclude<Placeholders<F[keyof F]>, 'count'>]: string | number }
    : { [P in Placeholders<M>]: string | number }

export type ArgsFor<T, K extends string> = keyof ParamsOf<MessageAt<T, K>> extends never ? [] : [ParamsOf<MessageAt<T, K>>]
