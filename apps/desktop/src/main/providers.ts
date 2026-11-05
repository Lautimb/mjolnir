import { createGitHubClient, github, GITHUB_HOST, type ParsedRemote, type ProviderDefinition, type PullRequestProvider, type RemoteRepo } from '@mjolnir/core'
import type { ProviderCredential, ProviderIdentity } from '@mjolnir/plugin-sdk'
import type { AuthMethod } from '../shared/api'

export interface ProviderAdapter {
  definition: ProviderDefinition
  defaultHost: string
  cli: { command: string; tokenArgs(host: string): string[] } | null
  deviceFlowClientId: string | null
  token: boolean
  connect(credential: ProviderCredential): { pulls: PullRequestProvider | null; identify(): Promise<ProviderIdentity> }
}

const GITHUB_OAUTH_CLIENT_ID = ''

const githubAdapter: ProviderAdapter = {
  definition: github,
  defaultHost: GITHUB_HOST,
  cli: { command: 'gh', tokenArgs: (host) => ['auth', 'token', '--hostname', host] },
  deviceFlowClientId: GITHUB_OAUTH_CLIENT_ID || null,
  token: true,
  connect({ token }) {
    const client = createGitHubClient({ token })
    return {
      pulls: client,
      identify: async () => {
        const user = await client.viewer()
        return { login: user.login, name: user.name ?? null, avatarUrl: user.avatar_url ?? null }
      },
    }
  },
}

export const BUILT_IN_PROVIDERS: readonly ProviderAdapter[] = [githubAdapter]

export class ProviderRegistry {
  constructor(private readonly plugins: () => readonly ProviderAdapter[] = () => []) {}

  all(): ProviderAdapter[] {
    return [...BUILT_IN_PROVIDERS, ...this.plugins()]
  }

  get(providerId: string): ProviderAdapter | undefined {
    return this.all().find((adapter) => adapter.definition.id === providerId)
  }

  match(remote: ParsedRemote): RemoteRepo | null {
    for (const adapter of this.all()) {
      const match = adapter.definition.matchRemote(remote)
      if (match) return match
    }
    return null
  }
}

export function authMethods(adapter: ProviderAdapter): AuthMethod[] {
  return [
    ...(adapter.cli ? (['cli'] as const) : []),
    ...(adapter.deviceFlowClientId ? (['device'] as const) : []),
    ...(adapter.token ? (['token'] as const) : []),
  ]
}
