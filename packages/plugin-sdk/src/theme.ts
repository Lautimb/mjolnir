export const THEME_TOKENS = [
  '--color-canvas',
  '--color-surface',
  '--color-raised',
  '--color-hover',
  '--color-selected',
  '--color-line',
  '--color-line-strong',
  '--color-fg',
  '--color-muted',
  '--color-subtle',
  '--color-accent',
  '--color-on-accent',
  '--color-danger',
  '--color-success',
  '--font-sans',
  '--font-mono',
  '--text-xs',
  '--text-sm',
  '--text-md',
  '--text-lg',
  '--text-xl',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--shadow-popover',
  '--spacing-control',
] as const

export type ThemeToken = (typeof THEME_TOKENS)[number]

export function readTheme(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>): Record<string, string> {
  return Object.fromEntries(THEME_TOKENS.map((token) => [token, style.getPropertyValue(token).trim()]).filter(([, value]) => value))
}

export function applyTheme(target: Pick<CSSStyleDeclaration, 'setProperty'>, theme: Record<string, string>): void {
  for (const token of THEME_TOKENS) {
    const value = theme[token]
    if (value) target.setProperty(token, value)
  }
}
