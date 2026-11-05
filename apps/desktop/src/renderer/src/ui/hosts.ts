import type { Host } from '@mjolnir/core/browser'

export const HOST_TEXT: Record<Host['kind'], string> = {
  wsl: 'text-wsl',
  windows: 'text-windows',
  posix: 'text-posix',
}
