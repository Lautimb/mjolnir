import { dialog } from 'electron'
import type { Services } from '.'
import { handle, listen } from './handle'
import { grantedPermissions, id, label } from '../schemas'

export function registerPluginsIpc({ window, plugins, pluginPorts }: Services): void {
  handle('plugins:list', [], () => plugins.list())
  handle('plugins:addFolder', [label], async (title) => {
    const parent = window.current
    if (!parent) return null
    const result = await dialog.showOpenDialog(parent, { title, properties: ['openDirectory'] })
    const [folder] = result.filePaths
    return result.canceled || !folder ? null : plugins.addFolder(folder)
  })
  handle('plugins:enable', [id, grantedPermissions], (pluginId, approved) => plugins.enable(pluginId, approved))
  handle('plugins:disable', [id], (pluginId) => plugins.disable(pluginId))
  handle('plugins:remove', [id], (pluginId) => plugins.remove(pluginId))
  listen('plugins:connect', [id, id], (pluginId, nonce) => {
    const port = pluginPorts.connect(pluginId)
    window.current?.webContents.postMessage('plugins:port', { nonce, ok: !!port }, port ? [port] : [])
  })
}
