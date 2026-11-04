export interface Settings {
  panelPosition: 'left' | 'right'
  terminalCursorStyle: 'block' | 'bar' | 'underline'
  terminalCursorBlink: boolean
  diffSideBySide: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  panelPosition: 'left',
  terminalCursorStyle: 'bar',
  terminalCursorBlink: true,
  diffSideBySide: true,
}

export const TITLEBAR_HEIGHT = 36
