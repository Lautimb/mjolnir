export type ClassValue = string | false | null | undefined

export function cx(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ')
}

export const eyebrow = 'text-xs font-semibold uppercase tracking-[0.06em]'

export const focusRing = 'focus:outline-none focus:border-accent'
