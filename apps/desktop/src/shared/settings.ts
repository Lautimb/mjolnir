import type { LanguagePreference } from './locales'

export interface Settings {
  language: LanguagePreference
  panelPosition: 'left' | 'right'
  terminalCursorStyle: 'block' | 'bar' | 'underline'
  terminalCursorBlink: boolean
  diffSideBySide: boolean
  hiddenPluginViews: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'system',
  panelPosition: 'left',
  terminalCursorStyle: 'bar',
  terminalCursorBlink: true,
  diffSideBySide: true,
  hiddenPluginViews: [],
}

export const TITLEBAR_HEIGHT = 36
