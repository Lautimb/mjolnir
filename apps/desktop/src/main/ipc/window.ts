import type { Services } from '.'
import { handle, listen } from './handle'
import { id, notificationText, settingsPatch } from '../schemas'

export function registerWindowIpc({ window, store }: Services): void {
  listen('window:minimize', [], () => window.minimize())
  listen('window:toggleMaximize', [], () => window.toggleMaximize())
  listen('window:close', [], () => window.close())
  handle('window:isMaximized', [], () => window.isMaximized())
  listen('window:notify', [id, notificationText, notificationText], (tag, title, body) => window.notify(tag, title, body))

  handle('settings:get', [], () => store.settings())
  handle('settings:update', [settingsPatch], (patch) => {
    const settings = store.updateSettings(patch)
    if (patch.zoom !== undefined) window.setZoom(settings.zoom)
    return settings
  })
}
