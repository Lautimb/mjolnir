import { ipcMain } from 'electron'
import type { Accounts } from '../accounts'

export function registerAccountsIpc(accounts: Accounts): void {
  ipcMain.handle('accounts:providers', () => accounts.providers())
  ipcMain.handle('accounts:list', () => accounts.list())
  ipcMain.handle('accounts:connectCli', (_event, provider: string) => accounts.connectCli(provider))
  ipcMain.handle('accounts:connectToken', (_event, provider: string, token: string) => accounts.connectToken(provider, token))
  ipcMain.handle('accounts:startDeviceFlow', (_event, provider: string) => accounts.startDeviceFlow(provider))
  ipcMain.handle('accounts:finishDeviceFlow', (_event, provider: string) => accounts.finishDeviceFlow(provider))
  ipcMain.on('accounts:cancelDeviceFlow', (_event, provider: string) => accounts.cancelDeviceFlow(provider))
  ipcMain.handle('accounts:disconnect', (_event, provider: string, host: string) => accounts.disconnect(provider, host))
}
