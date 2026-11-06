import type { LanguagePreference } from './locales'

export interface Settings {
  language: LanguagePreference
  panelPosition: 'left' | 'right'
  zoom: number
  terminalCursorStyle: 'block' | 'bar' | 'underline'
  terminalCursorBlink: boolean
  terminalFontSize: number
  diffSideBySide: boolean
  diffTree: boolean
  hiddenPluginViews: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  panelPosition: 'left',
  zoom: 1,
  terminalCursorStyle: 'bar',
  terminalCursorBlink: true,
  terminalFontSize: 13,
  diffSideBySide: true,
  diffTree: true,
  hiddenPluginViews: [],
}

export const TERMINAL_FONT_SIZE = { min: 8, max: 32, default: DEFAULT_SETTINGS.terminalFontSize }

export const TITLEBAR_HEIGHT = 36
