import type { LanguagePreference } from './locales'

export interface Settings {
  language: LanguagePreference
  panelPosition: 'left' | 'right'
  terminalCursorStyle: 'block' | 'bar' | 'underline'
  terminalCursorBlink: boolean
  diffSideBySide: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  panelPosition: 'left',
  terminalCursorStyle: 'bar',
  terminalCursorBlink: true,
  diffSideBySide: true,
}

export const TITLEBAR_HEIGHT = 36
