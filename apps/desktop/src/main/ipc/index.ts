import type { Accounts } from '../accounts'
import type { Environment } from '../environment'
import type { PluginPorts } from '../plugins/ports'
import type { PluginRegistry } from '../plugins/registry'
import type { PtyManager } from '../pty'
import type { Pulls } from '../pulls'
import type { Store } from '../store'
import type { MainWindow } from '../window'
import type { Workspace } from '../workspace'
import { registerAccountsIpc } from './accounts'
import { registerPluginsIpc } from './plugins'
import { registerPullsIpc } from './pulls'
import { registerTerminalsIpc } from './terminals'
import { registerWindowIpc } from './window'
import { registerWorkspaceIpc } from './workspace'

export interface Services {
  environment: Environment
  window: MainWindow
  store: Store
  workspace: Workspace
  accounts: Accounts
  pulls: Pulls
  terminals: PtyManager
  plugins: PluginRegistry
  pluginPorts: PluginPorts
}

export function registerIpc(services: Services): void {
  registerWindowIpc(services)
  registerWorkspaceIpc(services)
  registerTerminalsIpc(services)
  registerAccountsIpc(services)
  registerPullsIpc(services)
  registerPluginsIpc(services)
}
