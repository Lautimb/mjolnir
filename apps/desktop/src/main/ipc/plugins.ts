import { dialog } from 'electron'
import { PACKAGE_EXTENSION } from '@mjolnir/plugin-sdk/manifest'
import type { Services } from '.'
import { handle, listen } from './handle'
import { flag, grantedPermissions, id, label, portRole } from '../schemas'

export function registerPluginsIpc({ window, plugins, pluginCatalog, pluginPorts }: Services): void {
  handle('plugins:list', [], () => plugins.list())
  handle('plugins:addFolder', [label], async (title) => {
    const parent = window.current
    if (!parent) return null
    const result = await dialog.showOpenDialog(parent, { title, properties: ['openDirectory'] })
    const [folder] = result.filePaths
    return result.canceled || !folder ? null : plugins.addFolder(folder)
  })
  handle('plugins:installFile', [label, label], async (title, filterName) => {
    const parent = window.current
    if (!parent) return null
    const result = await dialog.showOpenDialog(parent, { title, properties: ['openFile'], filters: [{ name: filterName, extensions: [PACKAGE_EXTENSION] }] })
    const [file] = result.filePaths
    return result.canceled || !file ? null : plugins.installPackage(file)
  })
  handle('plugins:catalog', [flag], (refresh) => pluginCatalog.state(refresh))
  handle('plugins:installFromCatalog', [id], async (pluginId) => {
    const { zip, entry } = await pluginCatalog.download(pluginId)
    return plugins.installArchive(zip, `${entry.id}-${entry.version}.${PACKAGE_EXTENSION}`, {
      origin: 'catalog',
      verified: entry.verified,
      expect: { id: entry.id, version: entry.version },
    })
  })
  handle('plugins:applyUpdate', [id, grantedPermissions], (pluginId, approved) => plugins.applyUpdate(pluginId, approved))
  handle('plugins:discardUpdate', [id], (pluginId) => plugins.discardUpdate(pluginId))
  handle('plugins:enable', [id, grantedPermissions], (pluginId, approved) => plugins.enable(pluginId, approved))
  handle('plugins:disable', [id], (pluginId) => plugins.disable(pluginId))
  handle('plugins:remove', [id], (pluginId) => plugins.remove(pluginId))
  listen('plugins:connect', [id, id, portRole], (pluginId, nonce, role) => {
    const port = pluginPorts.connect(pluginId, role)
    window.current?.webContents.postMessage('plugins:port', { nonce, ok: !!port }, port ? [port] : [])
  })
}
