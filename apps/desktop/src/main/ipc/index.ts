import type { Accounts } from '../accounts'
import type { Environment } from '../environment'
import type { PtyManager } from '../pty'
import type { Pulls } from '../pulls'
import type { Store } from '../store'
import type { MainWindow } from '../window'
import type { Workspace } from '../workspace'
import { registerAccountsIpc } from './accounts'
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
}

export function registerIpc(services: Services): void {
  registerWindowIpc(services)
  registerWorkspaceIpc(services)
  registerTerminalsIpc(services)
  registerAccountsIpc(services)
  registerPullsIpc(services)
}
