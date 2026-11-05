import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import type { Account, DeviceCode } from '@mjolnir/core/browser'
import type { ProviderInfo } from '../../../shared/api'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { FormError, TextInput } from '../ui/fields'
import { Description } from '../ui/Description'

const line = 'flex flex-wrap items-center gap-2'

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
    <div className="flex flex-col gap-2 border-b border-line py-3">
      <div className={`${line} justify-between`}>
        <strong>{provider.displayName}</strong>
        {account ? (
          <div className={line}>
            <Avatar url={account.avatarUrl} />
            <span>{t('accounts.connectedAs', { login: account.login })}</span>
            <span className="text-xs text-subtle">{t(`accounts.sources.${account.source}`)}</span>
            <Button variant="ghost" disabled={busy} onClick={() => run(() => accounts.disconnect(account.provider, account.host))}>
              {t('accounts.disconnect')}
            </Button>
          </div>
        ) : (
          mode.kind === 'idle' && (
            <div className={line}>
              {provider.cli && provider.methods.includes('cli') && (
                <Button disabled={busy} onClick={() => run(() => accounts.connectCli(provider.id))}>
                  {busy && <Loader2 size={13} className="animate-spin" />}
                  {t('accounts.useCli', { cli: provider.cli })}
                </Button>
              )}
              {provider.methods.includes('device') && (
                <Button variant="primary" disabled={busy} onClick={startDevice}>
                  {t('accounts.connectBrowser')}
                </Button>
              )}
              <Button variant="ghost" disabled={busy} onClick={() => setMode({ kind: 'token', value: '' })}>
                {t('accounts.useToken')}
              </Button>
            </div>
          )
        )}
      </div>

      {mode.kind === 'token' && (
        <form className={line} onSubmit={saveToken}>
          <TextInput
            className="min-w-[220px] flex-1"
            autoFocus
            type="password"
            placeholder={t('accounts.tokenPlaceholder')}
            value={mode.value}
            onChange={(event) => setMode({ kind: 'token', value: event.target.value })}
          />
          <Button type="submit" variant="primary" disabled={busy || !mode.value.trim()}>
            {t('accounts.save')}
          </Button>
          <Button variant="ghost" onClick={cancel}>
            {t('common.cancel')}
          </Button>
          <Description>{t('accounts.tokenHint')}</Description>
        </form>
      )}

      {mode.kind === 'device' && (
        <div className={line}>
          <span>{t('accounts.deviceCode', { provider: provider.displayName })}</span>
          <code className="rounded-md bg-accent/12 px-3 py-1 font-mono text-lg tracking-[0.1em] text-accent">{mode.code.userCode}</code>
          <Button onClick={() => window.open(mode.code.verificationUri)}>
            <ExternalLink size={13} />
            {t('accounts.openBrowser', { provider: provider.displayName })}
          </Button>
          <span className="flex items-center gap-1 text-sm text-muted">
            <Loader2 size={13} className="animate-spin" />
            {t('accounts.waiting')}
          </span>
          <Button variant="ghost" onClick={cancel}>
            {t('common.cancel')}
          </Button>
        </div>
      )}

      {error !== null && <FormError>{describeError(t, error)}</FormError>}
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
      <Description>{t('accounts.description')}</Description>
      {providers.map((provider) => (
        <ProviderAccount
          key={provider.id}
          provider={provider}
          account={accounts.find((account) => account.provider === provider.id)}
          onChange={() => void refresh()}
        />
      ))}
      <Description>{t('accounts.morePlugins')}</Description>
    </>
  )
}
