import type { Services } from '.'
import { handle, listen } from './handle'
import { id, label, token } from '../schemas'

export function registerAccountsIpc({ accounts }: Services): void {
  handle('accounts:providers', [], () => accounts.providers())
  handle('accounts:list', [], () => accounts.list())
  handle('accounts:connectCli', [id], (provider) => accounts.connectCli(provider))
  handle('accounts:connectToken', [id, token], (provider, secret) => accounts.connectToken(provider, secret))
  handle('accounts:startDeviceFlow', [id], (provider) => accounts.startDeviceFlow(provider))
  handle('accounts:finishDeviceFlow', [id], (provider) => accounts.finishDeviceFlow(provider))
  listen('accounts:cancelDeviceFlow', [id], (provider) => accounts.cancelDeviceFlow(provider))
  handle('accounts:disconnect', [id, label], (provider, host) => accounts.disconnect(provider, host))
}
