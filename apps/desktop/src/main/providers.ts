import { createGitHubClient, github, GITHUB_HOST, type ProviderDefinition, type PullRequestProvider } from '@mjolnir/core'
import type { AuthMethod } from '../shared/api'

export interface Identity {
  login: string
  name: string | null
  avatarUrl: string | null
}

export interface ProviderAdapter {
  definition: ProviderDefinition
  defaultHost: string
  cli: { command: string; tokenArgs(host: string): string[] } | null
  deviceFlowClientId: string | null
  connect(token: string): { pulls: PullRequestProvider; identify(): Promise<Identity> }
}

const GITHUB_OAUTH_CLIENT_ID = ''

const githubAdapter: ProviderAdapter = {
  definition: github,
  defaultHost: GITHUB_HOST,
  cli: { command: 'gh', tokenArgs: (host) => ['auth', 'token', '--hostname', host] },
  deviceFlowClientId: GITHUB_OAUTH_CLIENT_ID || null,
  connect(token) {
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

export const PROVIDERS: ProviderAdapter[] = [githubAdapter]

export function adapterFor(providerId: string): ProviderAdapter | undefined {
  return PROVIDERS.find((adapter) => adapter.definition.id === providerId)
}

export function authMethods(adapter: ProviderAdapter): AuthMethod[] {
  return [
    ...(adapter.cli ? (['cli'] as const) : []),
    ...(adapter.deviceFlowClientId ? (['device'] as const) : []),
    'token',
  ]
}
