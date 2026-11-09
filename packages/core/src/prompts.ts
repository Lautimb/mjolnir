import type { TerminalProfile } from './profiles'

export const PROMPT_ENV = 'MJOLNIR_PROMPT'
export const MAX_PROMPT = 16_000
export const TAKE_PROMPT_FILE = '.mjolnir/prompts/take.md'
export const PROMPT_VARS = ['id', 'title', 'url', 'branch', 'description'] as const

export type PromptVar = (typeof PROMPT_VARS)[number]

export interface Ticket {
  id: string
  title: string
  url?: string
  description?: string
}

export function renderPrompt(template: string, values: Partial<Record<PromptVar, string>>): string {
  return template
    .replace(/\{(\w+)\}/g, (placeholder, name: string) => (PROMPT_VARS.includes(name as PromptVar) ? (values[name as PromptVar] ?? '') : placeholder))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_PROMPT)
}

type PromptShell = 'posix' | 'pwsh' | 'powershell' | 'cmd'

function promptShell(profile: TerminalProfile): PromptShell {
  if (profile.host.kind !== 'windows') return 'posix'
  const name = profile.file.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  if (name === 'pwsh.exe') return 'pwsh'
  if (name === 'powershell.exe') return 'powershell'
  return 'cmd'
}

export function supportsPrompt(profile: TerminalProfile): boolean {
  return promptShell(profile) !== 'cmd'
}

export function promptArgument(profile: TerminalProfile): string | null {
  const shell = promptShell(profile)
  if (shell === 'cmd') return null
  return shell === 'posix' ? `"$${PROMPT_ENV}"` : `$env:${PROMPT_ENV}`
}

/**
 * Windows PowerShell 5.1 wraps native arguments in quotes without escaping the quotes inside,
 * so the value is pre-escaped for CommandLineToArgvW. pwsh 7.3+ already escapes on its own.
 */
function legacyNativeArgument(value: string): string {
  const escaped = value.replace(/(\\*)"/g, (_, slashes: string) => `${slashes}${slashes}\\"`)
  return /\s/.test(value) ? escaped.replace(/(\\+)$/, '$1$1') : escaped
}

export function promptEnv(profile: TerminalProfile, prompt: string, wslenv: string | undefined): Record<string, string> {
  const value = promptShell(profile) === 'powershell' ? legacyNativeArgument(prompt) : prompt
  const shared = (wslenv ?? '').split(':').filter((entry) => entry && entry.split('/')[0] !== PROMPT_ENV)
  return { [PROMPT_ENV]: value, WSLENV: [...shared, PROMPT_ENV].join(':') }
}
