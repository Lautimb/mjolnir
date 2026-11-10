import { join } from 'node:path'
import { app, net, safeStorage, session } from 'electron'
import { localize, type ProviderCredential } from '@mjolnir/plugin-sdk'
import { SOURCE_LOCALE } from '../shared/locales'
import { nextZoom } from '../shared/zoom'
import { Accounts } from './accounts'
import { AgentStatusFiles } from './agent-status'
import { detectEnvironment } from './environment'
import { registerIpc } from './ipc'
import { PluginBackgrounds } from './plugins/backgrounds'
import { PluginCatalog } from './plugins/catalog'
import { createBroker } from './plugins/broker'
import { PluginData } from './plugins/data'
import { HostFailure } from './plugins/failure'
import { PluginPorts } from './plugins/ports'
import { pluginProviderAdapter } from './plugins/provider-adapter'
import { registerPluginScheme, servePlugins } from './plugins/protocol'
import { PluginRegistry, SUPPORTED_API } from './plugins/registry'
import { ProviderRegistry } from './providers'
import { PtyManager } from './pty'
import { Pulls } from './pulls'
import { hardenApp, openExternal } from './security'
import { Store } from './store'
import { MainWindow } from './window'
import { Workspace } from './workspace'

registerPluginScheme()

interface PluginDeps {
  userData: string
  workspace: Workspace
  window: MainWindow
  accountCredential(provider: string, host: string): Promise<ProviderCredential | null>
  onChange(): void
}

function createPlugins({ userData, workspace, window, accountCredential, onChange }: PluginDeps) {
  const registry = new PluginRegistry({
    file: join(userData, 'plugins.json'),
    packagesDir: join(userData, 'plugins'),
    appVersion: app.getVersion(),
    watch: true,
    onChange,
  })
  const data = new PluginData(join(userData, 'plugin-data'), {
    encrypt: (value) => {
      if (!safeStorage.isEncryptionAvailable()) throw new HostFailure('unavailable', 'secure storage is not available on this system')
      return safeStorage.encryptString(value).toString('base64')
    },
    decrypt: (value) => safeStorage.decryptString(Buffer.from(value, 'base64')),
  })
  const backgrounds = new PluginBackgrounds({
    start: (pluginId) => {
      if (!window.current) return false
      window.send('plugins:background', pluginId, true)
      return true
    },
    stop: (pluginId) => window.send('plugins:background', pluginId, false),
  })
  const providers = new ProviderRegistry(() =>
    registry.providers().map(({ pluginId, provider, strings }) =>
      pluginProviderAdapter(pluginId, provider, localize(provider.displayName, strings[SOURCE_LOCALE] ?? {}), (providerId, method, params) =>
        backgrounds.invoke(pluginId, providerId, method, params),
      ),
    ),
  )
  const broker = createBroker({
    data,
    permissions: (pluginId) => registry.permissions(pluginId),
    fetch: (pluginId) => (url, init) => session.fromPartition(`plugin:${pluginId}`).fetch(url, init),
    worktreeRoot: ({ repoId, worktree }) =>
      workspace.nativeWorktreePath(repoId, worktree).catch(() => {
        throw new HostFailure('invalidRequest', 'unknown session')
      }),
    accountCredential,
    openExternal,
  })
  const ports = new PluginPorts(broker, backgrounds, (pluginId) => !!registry.permissions(pluginId))
  app.on('before-quit', () => {
    data.flush()
    registry.dispose()
  })
  const catalog = new PluginCatalog({
    cacheFile: join(userData, 'plugin-catalog.json'),
    appVersion: app.getVersion(),
    apiVersions: SUPPORTED_API,
    fetch: (url, init) => net.fetch(url, init),
  })
  return { registry, catalog, ports, providers }
}

void app.whenReady().then(async () => {
  hardenApp()
  const environment = detectEnvironment()
  const userData = app.getPath('userData')
  const store = new Store(join(userData, 'workspace.json'))
  const workspace = new Workspace(store)
  const terminals = new PtyManager((channel, id, payload) => window.send(channel, id, payload))
  const agentStatus = new AgentStatusFiles(join(userData, 'agent-status'), (id, event) => window.send('pty:agentEvent', id, event))
  agentStatus.start()
  app.on('before-quit', () => agentStatus.dispose())
  const window = new MainWindow(
    environment.appHost,
    {
      current: () => store.settings().zoom,
      change: (direction) => {
        const settings = store.updateSettings({ zoom: nextZoom(store.settings().zoom, direction) })
        window.setZoom(settings.zoom)
        window.send('settings:changed', settings)
      },
    },
    () => terminals.killAll(),
  )
  const plugins = createPlugins({
    userData,
    workspace,
    window,
    accountCredential: (provider, host) => accounts.credentialFor(provider, host),
    onChange: () => {
      plugins.ports.closeInactive()
      window.send('plugins:changed')
    },
  })
  const accounts = new Accounts(join(userData, 'accounts.json'), environment.repoHosts, plugins.providers)
  await plugins.registry.init()
  servePlugins((pluginId) => plugins.registry.root(pluginId))

  registerIpc({
    environment,
    window,
    store,
    workspace,
    accounts,
    pulls: new Pulls(workspace, accounts, plugins.providers),
    terminals,
    agentStatus,
    plugins: plugins.registry,
    pluginCatalog: plugins.catalog,
    pluginPorts: plugins.ports,
  })
  window.open()
  app.on('activate', () => window.open())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
