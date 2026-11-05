import { describe, expect, it } from 'vitest'
import { nextZoom, zoomShortcut } from './zoom'

const key = (value: string, modifiers: { control?: boolean; meta?: boolean; alt?: boolean } = {}, type = 'keyDown') => ({
  type,
  key: value,
  control: !!modifiers.control,
  meta: !!modifiers.meta,
  alt: !!modifiers.alt,
})

describe('nextZoom', () => {
  it('moves between the same levels as a browser and stops at the ends', () => {
    expect(nextZoom(1, 'in')).toBe(1.1)
    expect(nextZoom(1.1, 'out')).toBe(1)
    expect(nextZoom(2, 'in')).toBe(2)
    expect(nextZoom(0.5, 'out')).toBe(0.5)
    expect(nextZoom(1.75, 'reset')).toBe(1)
  })

  it('snaps a value between levels to the next one', () => {
    expect(nextZoom(1.05, 'in')).toBe(1.1)
    expect(nextZoom(1.05, 'out')).toBe(1)
  })
})

describe('zoomShortcut', () => {
  it('zooms with Ctrl, or Cmd on macOS, and the +, - and 0 keys of any layout', () => {
    expect(zoomShortcut(key('=', { control: true }), 'win32')).toBe('in')
    expect(zoomShortcut(key('+', { control: true }), 'linux')).toBe('in')
    expect(zoomShortcut(key('-', { meta: true }), 'darwin')).toBe('out')
    expect(zoomShortcut(key('0', { control: true }), 'win32')).toBe('reset')
  })

  it('ignores other combinations and key releases', () => {
    expect(zoomShortcut(key('-', { control: true }), 'darwin')).toBeNull()
    expect(zoomShortcut(key('-', { control: true, alt: true }), 'win32')).toBeNull()
    expect(zoomShortcut(key('=', { control: true }, 'keyUp'), 'win32')).toBeNull()
    expect(zoomShortcut(key('v', { control: true }), 'win32')).toBeNull()
  })
})
