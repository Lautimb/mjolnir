import { TERMINAL_FONT_SIZE } from '../../../shared/settings'

export type TerminalShortcut = 'copy' | 'paste'

type Keys = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

export function terminalShortcut(event: Keys, platform: NodeJS.Platform, hasSelection: boolean): TerminalShortcut | null {
  if (platform === 'darwin' || event.altKey || !event.ctrlKey) return null
  const key = event.key.toLowerCase()
  if (key === 'v') return 'paste'
  if (key === 'c' && (event.shiftKey || hasSelection)) return 'copy'
  return null
}

export function stepFontSize(fontSize: number, step: 1 | -1): number {
  return Math.min(TERMINAL_FONT_SIZE.max, Math.max(TERMINAL_FONT_SIZE.min, fontSize + step))
}
