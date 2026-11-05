import type { Services } from '.'
import { handle, listen } from './handle'
import { settingsPatch } from '../schemas'

export function registerWindowIpc({ window, store }: Services): void {
  listen('window:minimize', [], () => window.minimize())
  listen('window:toggleMaximize', [], () => window.toggleMaximize())
  listen('window:close', [], () => window.close())
  handle('window:isMaximized', [], () => window.isMaximized())

  handle('settings:get', [], () => store.settings())
  handle('settings:update', [settingsPatch], (patch) => store.updateSettings(patch))
}
