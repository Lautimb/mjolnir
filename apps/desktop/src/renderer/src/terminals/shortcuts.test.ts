import { describe, expect, it } from 'vitest'
import { stepFontSize, terminalShortcut } from './shortcuts'

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
})

describe('stepFontSize', () => {
  it('stays within the supported sizes', () => {
    expect(stepFontSize(13, 1)).toBe(14)
    expect(stepFontSize(32, 1)).toBe(32)
    expect(stepFontSize(8, -1)).toBe(8)
  })
})
