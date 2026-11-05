import { z } from 'zod'
import { ProviderRequestError } from '@mjolnir/core'
import {
  matchRemote,
  type PullRequestComment,
  type PullRequestDetail,
  type PullRequestSummary,
  type ProviderIdentity,
  type ProviderMethod,
} from '@mjolnir/plugin-sdk'
import { pluginProviderId, type ProviderContribution } from '@mjolnir/plugin-sdk/manifest'
import { AppError } from '../../shared/errors'
import type { ProviderAdapter } from '../providers'
import { HostFailure } from './failure'

export type Invoke = (provider: string, method: ProviderMethod, params: unknown[]) => Promise<unknown>

const text = z.string().max(100_000)
const nullableText = text.nullable()
const person = z.object({ login: z.string().max(500), avatarUrl: z.string().max(2000).nullable() })

const identity: z.ZodType<ProviderIdentity> = z.object({ login: z.string().min(1).max(500), name: nullableText, avatarUrl: z.string().max(2000).nullable() })

const summaryShape = {
  number: z.number().int().nonnegative(),
  title: text,
  author: person,
  state: z.enum(['open', 'closed', 'merged']),
  draft: z.boolean(),
  headRef: z.string().max(500),
  baseRef: z.string().max(500),
  url: z.url({ protocol: /^https?$/ }),
  createdAt: z.string().max(100),
  updatedAt: z.string().max(100),
}

const summary: z.ZodType<PullRequestSummary> = z.object(summaryShape)

const count = z.number().int().nonnegative().nullable()

const detail: z.ZodType<PullRequestDetail> = z.object({
  ...summaryShape,
  body: text,
  headSha: z.string().max(100),
  additions: count,
  deletions: count,
  changedFiles: count,
  reviews: z
    .array(
      z.object({
        author: person,
        state: z.enum(['approved', 'changes_requested', 'commented', 'dismissed', 'pending']),
        submittedAt: z.string().max(100).nullable(),
      }),
    )
    .max(1000),
  reviewDecision: z.enum(['approved', 'changes_requested', 'review_required']).nullable(),
  checks: z.enum(['success', 'failure', 'pending']).nullable(),
})

const comment: z.ZodType<PullRequestComment> = z.object({
  id: z.string().max(200),
  author: person,
  body: text,
  createdAt: z.string().max(100),
  url: z.url({ protocol: /^https?$/ }),
})

export function pluginProviderAdapter(pluginId: string, contribution: ProviderContribution, displayName: string, invoke: Invoke): ProviderAdapter {
  const id = pluginProviderId(pluginId, contribution.id)

  const call = async <T>(method: ProviderMethod, schema: z.ZodType<T>, params: unknown[]): Promise<T> => {
    let raw: unknown
    try {
      raw = await invoke(contribution.id, method, params)
    } catch (error) {
      if (error instanceof HostFailure && error.code === 'unauthorized') throw new ProviderRequestError(401, error.message)
      throw new AppError('pluginProviderFailed', { provider: displayName, message: error instanceof Error ? error.message : String(error) })
    }
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      throw new AppError('pluginProviderFailed', { provider: displayName, message: `${method}: ${issue?.path.join('.') ?? ''} ${issue?.message ?? 'invalid response'}` })
    }
    return parsed.data
  }

  const refspec = contribution.pulls?.refspec

  return {
    definition: { id, displayName, matchRemote: (remote) => matchRemote(contribution.remotes, id, remote) },
    defaultHost: contribution.defaultHost,
    cli: contribution.auth.cli ? { command: contribution.auth.cli.command, tokenArgs: () => contribution.auth.cli!.args } : null,
    deviceFlowClientId: null,
    token: contribution.auth.token,
    connect(credential) {
      return {
        identify: () => call('identify', identity, [credential]),
        pulls: refspec
          ? {
              list: (repo, query) => call('pulls.list', z.array(summary).max(1000), [credential, repo, query]),
              get: (repo, number) => call('pulls.get', detail, [credential, repo, number]),
              forBranch: (repo, branch) => call('pulls.forBranch', summary.nullable(), [credential, repo, branch]),
              comments: (repo, number) => call('pulls.comments', z.array(comment).max(5000), [credential, repo, number]),
              comment: (repo, number, body) => call('pulls.comment', comment, [credential, repo, number, body]),
              create: (repo, input) => call('pulls.create', summary, [credential, repo, input]),
              headRefspec: (number) => refspec.replace('{number}', String(number)),
            }
          : null,
      }
    },
  }
}
