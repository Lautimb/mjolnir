import { describe, expect, it } from 'vitest'
import { terminalShortcut, zoomed } from './shortcuts'

const keys = (key: string, modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}) => ({
  key,
  ctrlKey: !!modifiers.ctrl,
  metaKey: !!modifiers.meta,
  shiftKey: !!modifiers.shift,
  altKey: !!modifiers.alt,
})

describe('terminalShortcut', () => {
  it('pastes with Ctrl+V on Windows and Linux instead of sending ^V to the shell', () => {
    expect(terminalShortcut(keys('v', { ctrl: true }), 'win32', false)).toBe('paste')
    expect(terminalShortcut(keys('V', { ctrl: true, shift: true }), 'linux', false)).toBe('paste')
  })

  it('copies with Ctrl+C only when there is a selection, so Ctrl+C still interrupts', () => {
    expect(terminalShortcut(keys('c', { ctrl: true }), 'win32', true)).toBe('copy')
    expect(terminalShortcut(keys('c', { ctrl: true }), 'win32', false)).toBeNull()
    expect(terminalShortcut(keys('C', { ctrl: true, shift: true }), 'win32', false)).toBe('copy')
  })

  it('leaves copy and paste to the system on macOS, where Cmd never reaches the shell', () => {
    expect(terminalShortcut(keys('v', { meta: true }), 'darwin', false)).toBeNull()
    expect(terminalShortcut(keys('c', { ctrl: true }), 'darwin', true)).toBeNull()
  })

  it('zooms with Ctrl (Cmd on macOS) and the +, - and 0 keys of any layout', () => {
    expect(terminalShortcut(keys('=', { ctrl: true }), 'win32', false)).toBe('zoomIn')
    expect(terminalShortcut(keys('+', { ctrl: true, shift: true }), 'linux', false)).toBe('zoomIn')
    expect(terminalShortcut(keys('-', { meta: true }), 'darwin', false)).toBe('zoomOut')
    expect(terminalShortcut(keys('0', { ctrl: true }), 'win32', false)).toBe('zoomReset')
    expect(terminalShortcut(keys('-', { ctrl: true, alt: true }), 'win32', false)).toBeNull()
  })
})

describe('zoomed', () => {
  it('stays within the supported sizes and resets to the default', () => {
    expect(zoomed(13, 'zoomIn')).toBe(14)
    expect(zoomed(32, 'zoomIn')).toBe(32)
    expect(zoomed(8, 'zoomOut')).toBe(8)
    expect(zoomed(20, 'zoomReset')).toBe(13)
  })
})
