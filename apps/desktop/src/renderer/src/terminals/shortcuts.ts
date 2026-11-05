import { TERMINAL_FONT_SIZE } from '../../../shared/settings'

export type TerminalShortcut = 'copy' | 'paste' | 'zoomIn' | 'zoomOut' | 'zoomReset'

type Keys = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

const ZOOM: Record<string, TerminalShortcut> = { '=': 'zoomIn', '+': 'zoomIn', '-': 'zoomOut', '0': 'zoomReset' }

export function terminalShortcut(event: Keys, platform: NodeJS.Platform, hasSelection: boolean): TerminalShortcut | null {
  const mac = platform === 'darwin'
  if (event.altKey || !(mac ? event.metaKey : event.ctrlKey)) return null
  const zoom = ZOOM[event.key]
  if (zoom) return zoom
  if (mac) return null
  const key = event.key.toLowerCase()
  if (key === 'v') return 'paste'
  if (key === 'c' && (event.shiftKey || hasSelection)) return 'copy'
  return null
}

export function zoomed(fontSize: number, shortcut: 'zoomIn' | 'zoomOut' | 'zoomReset'): number {
  if (shortcut === 'zoomReset') return TERMINAL_FONT_SIZE.default
  return Math.min(TERMINAL_FONT_SIZE.max, Math.max(TERMINAL_FONT_SIZE.min, fontSize + (shortcut === 'zoomIn' ? 1 : -1)))
}
