import { join } from 'node:path'
import { app, safeStorage, session } from 'electron'
import { Accounts } from './accounts'
import { detectEnvironment } from './environment'
import { registerIpc } from './ipc'
import { createBroker } from './plugins/broker'
import { PluginData } from './plugins/data'
import { HostFailure } from './plugins/failure'
import { PluginPorts } from './plugins/ports'
import { registerPluginScheme, servePlugins } from './plugins/protocol'
import { PluginRegistry } from './plugins/registry'
import { PtyManager } from './pty'
import { Pulls } from './pulls'
import { hardenApp, openExternal } from './security'
import { Store } from './store'
import { MainWindow } from './window'
import { Workspace } from './workspace'

registerPluginScheme()

function createPlugins(userData: string, workspace: Workspace, onChange: () => void) {
  const registry = new PluginRegistry({ file: join(userData, 'plugins.json'), appVersion: app.getVersion(), watch: true, onChange })
  const data = new PluginData(join(userData, 'plugin-data'), {
    encrypt: (value) => {
      if (!safeStorage.isEncryptionAvailable()) throw new HostFailure('unavailable', 'secure storage is not available on this system')
      return safeStorage.encryptString(value).toString('base64')
    },
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64')),
  })
  const broker = createBroker({
    data,
    permissions: (pluginId) => registry.permissions(pluginId),
    fetch: (pluginId) => (url, init) => session.fromPartition(`plugin:${pluginId}`).fetch(url, init),
    worktreeRoot: ({ repoId, worktree }) =>
      workspace.nativeWorktreePath(repoId, worktree).catch(() => {
        throw new HostFailure('invalidRequest', 'unknown session')
      }),
    openExternal,
  })
  const ports = new PluginPorts(broker, (pluginId) => !!registry.permissions(pluginId))
  app.on('before-quit', () => {
    data.flush()
    registry.dispose()
  })
  return { registry, ports }
}

void app.whenReady().then(async () => {
  hardenApp()
  const environment = detectEnvironment()
  const userData = app.getPath('userData')
  const store = new Store(join(userData, 'workspace.json'))
  const workspace = new Workspace(store)
  const accounts = new Accounts(join(userData, 'accounts.json'), environment.repoHosts)
  const terminals = new PtyManager((channel, id, payload) => window.send(channel, id, payload))
  const window = new MainWindow(environment.appHost, () => terminals.killAll())
  const plugins = createPlugins(userData, workspace, () => {
    plugins.ports.closeInactive()
    window.send('plugins:changed')
  })
  await plugins.registry.init()
  servePlugins((pluginId) => plugins.registry.root(pluginId))

  registerIpc({
    environment,
    window,
    store,
    workspace,
    accounts,
    pulls: new Pulls(workspace, accounts),
    terminals,
    plugins: plugins.registry,
    pluginPorts: plugins.ports,
  })
  window.open()
  app.on('activate', () => window.open())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
