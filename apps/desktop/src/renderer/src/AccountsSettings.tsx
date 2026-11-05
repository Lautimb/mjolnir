import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import type { Account, DeviceCode } from '@mjolnir/core/browser'
import type { ProviderInfo } from '../../shared/api'
import { describeError, useI18n } from './i18n/I18nProvider'

type Mode = { kind: 'idle' } | { kind: 'token'; value: string } | { kind: 'device'; code: DeviceCode }

function ProviderAccount({ provider, account, onChange }: { provider: ProviderInfo; account: Account | undefined; onChange(): void }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const cancelled = useRef(false)
  const { accounts } = window.mjolnir

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    cancelled.current = false
    try {
      await action()
      setMode({ kind: 'idle' })
      onChange()
    } catch (err) {
      if (!cancelled.current) setError(err)
    } finally {
      setBusy(false)
    }
  }

  const startDevice = () =>
    run(async () => {
      const code = await accounts.startDeviceFlow(provider.id)
      setMode({ kind: 'device', code })
      window.open(code.verificationUri)
      await accounts.finishDeviceFlow(provider.id)
    })

  const cancel = () => {
    cancelled.current = true
    if (mode.kind === 'device') accounts.cancelDeviceFlow(provider.id)
    setMode({ kind: 'idle' })
    setError(null)
  }

  const saveToken = (event: FormEvent) => {
    event.preventDefault()
    if (mode.kind === 'token' && mode.value.trim()) void run(() => accounts.connectToken(provider.id, mode.value))
  }

  return (
    <div className="account">
      <div className="account-header">
        <strong>{provider.displayName}</strong>
        {account ? (
          <div className="account-identity">
            {account.avatarUrl && <img className="avatar" src={account.avatarUrl} alt="" />}
            <span>{t('accounts.connectedAs', { login: account.login })}</span>
            <span className="account-source">{t(`accounts.sources.${account.source}`)}</span>
            <button className="button ghost" disabled={busy} onClick={() => run(() => accounts.disconnect(account.provider, account.host))}>
              {t('accounts.disconnect')}
            </button>
          </div>
        ) : (
          mode.kind === 'idle' && (
            <div className="account-actions">
              {provider.cli && provider.methods.includes('cli') && (
                <button className="button" disabled={busy} onClick={() => run(() => accounts.connectCli(provider.id))}>
                  {busy && <Loader2 size={13} className="spin" />}
                  {t('accounts.useCli', { cli: provider.cli })}
                </button>
              )}
              {provider.methods.includes('device') && (
                <button className="button primary" disabled={busy} onClick={startDevice}>
                  {t('accounts.connectBrowser')}
                </button>
              )}
              <button className="button ghost" disabled={busy} onClick={() => setMode({ kind: 'token', value: '' })}>
                {t('accounts.useToken')}
              </button>
            </div>
          )
        )}
      </div>

      {mode.kind === 'token' && (
        <form className="account-token" onSubmit={saveToken}>
          <input
            autoFocus
            type="password"
            placeholder={t('accounts.tokenPlaceholder')}
            value={mode.value}
            onChange={(event) => setMode({ kind: 'token', value: event.target.value })}
          />
          <button type="submit" className="button primary" disabled={busy || !mode.value.trim()}>
            {t('accounts.save')}
          </button>
          <button type="button" className="button ghost" onClick={cancel}>
            {t('common.cancel')}
          </button>
          <span className="setting-description">{t('accounts.tokenHint')}</span>
        </form>
      )}

      {mode.kind === 'device' && (
        <div className="account-device">
          <span>{t('accounts.deviceCode', { provider: provider.displayName })}</span>
          <code className="device-code">{mode.code.userCode}</code>
          <button className="button" onClick={() => window.open(mode.code.verificationUri)}>
            <ExternalLink size={13} />
            {t('accounts.openBrowser', { provider: provider.displayName })}
          </button>
          <span className="account-waiting">
            <Loader2 size={13} className="spin" />
            {t('accounts.waiting')}
          </span>
          <button className="button ghost" onClick={cancel}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {error !== null && <div className="form-error">{describeError(t, error)}</div>}
    </div>
  )
}

export function AccountsSettings() {
  const { t } = useI18n()
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])

  const refresh = useCallback(async () => {
    const [nextProviders, nextAccounts] = await Promise.all([window.mjolnir.accounts.providers(), window.mjolnir.accounts.list()])
    setProviders(nextProviders)
    setAccounts(nextAccounts)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <>
      <p className="setting-description">{t('accounts.description')}</p>
      {providers.map((provider) => (
        <ProviderAccount
          key={provider.id}
          provider={provider}
          account={accounts.find((account) => account.provider === provider.id)}
          onChange={() => void refresh()}
        />
      ))}
      <p className="setting-description">{t('accounts.morePlugins')}</p>
    </>
  )
}
