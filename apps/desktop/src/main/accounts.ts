import { safeStorage } from 'electron'
import {
  createHostExec,
  pollDeviceToken,
  ProviderRequestError,
  requestDeviceCode,
  type Account,
  type DeviceCode,
  type Host,
  type PullRequestProvider,
} from '@mjolnir/core'
import type { ProviderInfo } from '../shared/api'
import { AppError } from '../shared/errors'
import { readJson, writeJsonAtomic } from './json-file'
import { authMethods, type ProviderAdapter, type ProviderRegistry } from './providers'

interface StoredAccount extends Account {
  secret?: string
  cliHost?: Host
}

const CLI_TOKEN_TTL_MS = 5 * 60 * 1000

const accountKey = (provider: string, host: string) => `${provider}:${host}`

export class Accounts {
  private accounts: StoredAccount[]
  private readonly cliTokens = new Map<string, { token: string; expires: number }>()
  private readonly deviceFlows = new Map<string, { code: DeviceCode; abort: AbortController }>()

  constructor(
    private readonly file: string,
    private readonly cliHosts: Host[],
    private readonly registry: ProviderRegistry,
  ) {
    this.accounts = this.load()
  }

  providers(): ProviderInfo[] {
    return this.registry.all().map((adapter) => ({
      id: adapter.definition.id,
      displayName: adapter.definition.displayName,
      cli: adapter.cli?.command ?? null,
      methods: authMethods(adapter),
    }))
  }

  list(): Account[] {
    return this.accounts.map(({ secret: _secret, cliHost: _cliHost, ...account }) => account)
  }

  find(provider: string, host: string): Account | null {
    return this.list().find((account) => accountKey(account.provider, account.host) === accountKey(provider, host)) ?? null
  }

  async connectCli(providerId: string): Promise<Account> {
    const adapter = this.adapter(providerId)
    const cli = adapter.cli
    if (!cli) throw new AppError('cliNotFound', { cli: providerId })
    for (const host of this.cliHosts) {
      const token = await this.runCli(adapter, host).catch(() => null)
      if (token) return this.save(adapter, token, { source: 'cli', cliHost: host })
    }
    throw new AppError('cliNotFound', { cli: cli.command })
  }

  async connectToken(providerId: string, token: string): Promise<Account> {
    const adapter = this.adapter(providerId)
    if (!adapter.token) throw new AppError('unsupportedRemote', {})
    return this.save(adapter, token.trim(), { source: 'token', secret: this.encrypt(token.trim()) })
  }

  async startDeviceFlow(providerId: string): Promise<DeviceCode> {
    const clientId = this.adapter(providerId).deviceFlowClientId
    if (!clientId) throw new AppError('deviceFlowUnavailable', {})
    this.cancelDeviceFlow(providerId)
    const code = await requestDeviceCode({ clientId })
    this.deviceFlows.set(providerId, { code, abort: new AbortController() })
    return code
  }

  async finishDeviceFlow(providerId: string): Promise<Account> {
    const adapter = this.adapter(providerId)
    const flow = this.deviceFlows.get(providerId)
    if (!flow || !adapter.deviceFlowClientId) throw new AppError('deviceFlowUnavailable', {})
    const result = await pollDeviceToken({ clientId: adapter.deviceFlowClientId, signal: flow.abort.signal }, flow.code)
    this.deviceFlows.delete(providerId)
    if (result.status === 'denied') throw new AppError('deviceFlowDenied', {})
    if (result.status === 'expired') throw new AppError('deviceFlowExpired', {})
    return this.save(adapter, result.token, { source: 'oauth', secret: this.encrypt(result.token) })
  }

  cancelDeviceFlow(providerId: string): void {
    this.deviceFlows.get(providerId)?.abort.abort()
    this.deviceFlows.delete(providerId)
  }

  disconnect(provider: string, host: string): void {
    this.accounts = this.accounts.filter((account) => accountKey(account.provider, account.host) !== accountKey(provider, host))
    this.cliTokens.delete(accountKey(provider, host))
    this.persist()
  }

  async token(provider: string, host: string): Promise<string | null> {
    const adapter = this.registry.get(provider)
    const stored = this.stored(provider, host)
    return adapter && stored ? this.credential(adapter, stored).catch(() => null) : null
  }

  async use<T>(provider: string, host: string, action: (pulls: PullRequestProvider) => Promise<T>): Promise<T> {
    const adapter = this.adapter(provider)
    const stored = this.stored(provider, host)
    if (!stored) throw new AppError('noAccount', { provider: adapter.definition.displayName })
    try {
      const { pulls } = adapter.connect({ host, token: await this.credential(adapter, stored), source: stored.source })
      if (!pulls) throw new AppError('unsupportedRemote', {})
      return await action(pulls)
    } catch (error) {
      if (error instanceof ProviderRequestError && error.status === 401) this.cliTokens.delete(accountKey(provider, host))
      throw toAppError(adapter, error)
    }
  }

  private stored(provider: string, host: string): StoredAccount | undefined {
    return this.accounts.find((account) => accountKey(account.provider, account.host) === accountKey(provider, host))
  }

  private async credential(adapter: ProviderAdapter, account: StoredAccount): Promise<string> {
    if (account.secret) return safeStorage.decryptString(Buffer.from(account.secret, 'base64'))
    const key = accountKey(account.provider, account.host)
    const cached = this.cliTokens.get(key)
    if (cached && cached.expires > Date.now()) return cached.token
    const token = account.cliHost ? await this.runCli(adapter, account.cliHost).catch(() => null) : null
    if (!token) throw new AppError('providerUnauthorized', { provider: adapter.definition.displayName })
    this.cliTokens.set(key, { token, expires: Date.now() + CLI_TOKEN_TTL_MS })
    return token
  }

  private async runCli(adapter: ProviderAdapter, host: Host): Promise<string | null> {
    if (!adapter.cli) return null
    const output = await createHostExec(host)('/', adapter.cli.command, adapter.cli.tokenArgs(adapter.defaultHost))
    return output.trim() || null
  }

  private async save(adapter: ProviderAdapter, token: string, credential: Pick<StoredAccount, 'source' | 'secret' | 'cliHost'>): Promise<Account> {
    const identity = await adapter.connect({ host: adapter.defaultHost, token, source: credential.source }).identify().catch((error: unknown) => {
      throw toAppError(adapter, error)
    })
    const account: StoredAccount = { provider: adapter.definition.id, host: adapter.defaultHost, ...identity, ...credential }
    this.accounts = [...this.accounts.filter((a) => accountKey(a.provider, a.host) !== accountKey(account.provider, account.host)), account]
    if (credential.source === 'cli') this.cliTokens.set(accountKey(account.provider, account.host), { token, expires: Date.now() + CLI_TOKEN_TTL_MS })
    this.persist()
    return this.find(account.provider, account.host)!
  }

  private encrypt(token: string): string {
    if (!safeStorage.isEncryptionAvailable()) throw new AppError('secureStorageUnavailable', {})
    return safeStorage.encryptString(token).toString('base64')
  }

  private adapter(providerId: string): ProviderAdapter {
    const adapter = this.registry.get(providerId)
    if (!adapter) throw new AppError('unsupportedRemote', {})
    return adapter
  }

  private load(): StoredAccount[] {
    return (readJson(this.file) as StoredAccount[] | null) ?? []
  }

  private persist(): void {
    writeJsonAtomic(this.file, this.accounts)
  }
}

function toAppError(adapter: ProviderAdapter, error: unknown): unknown {
  if (!(error instanceof ProviderRequestError)) return error
  if (error.status === 401) return new AppError('providerUnauthorized', { provider: adapter.definition.displayName })
  return new AppError('providerRequestFailed', { status: error.status, message: error.message })
}
