export const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const

export type ZoomDirection = 'in' | 'out' | 'reset'

export function nextZoom(current: number, direction: ZoomDirection): number {
  if (direction === 'reset') return 1
  if (direction === 'in') return ZOOM_LEVELS.find((level) => level > current + 0.001) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!
  return [...ZOOM_LEVELS].reverse().find((level) => level < current - 0.001) ?? ZOOM_LEVELS[0]
}

const KEYS: Record<string, ZoomDirection> = { '=': 'in', '+': 'in', '-': 'out', '0': 'reset' }

export function zoomShortcut(input: { type: string; key: string; control: boolean; meta: boolean; alt: boolean }, platform: NodeJS.Platform): ZoomDirection | null {
  if (input.type !== 'keyDown' || input.alt || !(platform === 'darwin' ? input.meta : input.control)) return null
  return KEYS[input.key] ?? null
}
