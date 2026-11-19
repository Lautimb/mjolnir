import type { Services } from '.'
import { handle, listen } from './handle'

export function registerUpdatesIpc({ updater }: Services): void {
  handle('updates:state', [], () => updater.state())
  listen('updates:check', [], () => updater.check())
  listen('updates:apply', [], () => updater.apply())
}
