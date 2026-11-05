import { join } from 'node:path'
import { app } from 'electron'
import { Accounts } from './accounts'
import { detectEnvironment } from './environment'
import { registerIpc } from './ipc'
import { PtyManager } from './pty'
import { Pulls } from './pulls'
import { hardenApp } from './security'
import { Store } from './store'
import { MainWindow } from './window'
import { Workspace } from './workspace'

void app.whenReady().then(() => {
  hardenApp()
  const environment = detectEnvironment()
  const userData = app.getPath('userData')
  const store = new Store(join(userData, 'workspace.json'))
  const workspace = new Workspace(store)
  const accounts = new Accounts(join(userData, 'accounts.json'), environment.repoHosts)
  const terminals = new PtyManager((channel, id, payload) => window.send(channel, id, payload))
  const window = new MainWindow(environment.appHost, () => terminals.killAll())

  registerIpc({ environment, window, store, workspace, accounts, pulls: new Pulls(workspace, accounts), terminals })
  window.open()
  app.on('activate', () => window.open())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
