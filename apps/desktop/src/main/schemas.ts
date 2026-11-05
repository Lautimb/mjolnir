import { z } from 'zod'
import { isSafeRef, type CreatePullRequestInput, type FileChange, type Host, type PullRequestQuery } from '@mjolnir/core'
import { isOriginPattern, isRepoGlob, type GrantablePermissions } from '@mjolnir/plugin-sdk'
import type { SpawnRequest } from '../shared/api'
import { LOCALE_IDS } from '../shared/locales'
import type { Settings } from '../shared/settings'

const MAX_PATH = 4096

export const id = z.string().min(1).max(200)
export const path = z.string().min(1).max(MAX_PATH)
export const label = z.string().max(200)
export const ref = z.string().refine(isSafeRef, 'unsafe git ref')
export const pullNumber = z.number().int().positive()
export const flag = z.boolean()
export const token = z.string().trim().min(1).max(1000)

export const host: z.ZodType<Host> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('windows') }),
  z.object({ kind: z.literal('posix') }),
  z.object({ kind: z.literal('wsl'), distro: z.string().min(1).max(100) }),
])

export const compareMode = z.enum(['working', 'branch'])

export const fileChange: z.ZodType<FileChange> = z.object({
  path,
  oldPath: path.optional(),
  status: z.enum(['modified', 'added', 'deleted', 'renamed', 'untracked']),
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  binary: z.boolean(),
})

export const pullRequestQuery: z.ZodType<PullRequestQuery> = z.object({
  filter: z.enum(['mine', 'review', 'all']),
  state: z.enum(['open', 'closed', 'all']),
})

export const createPullRequest: z.ZodType<CreatePullRequestInput> = z.object({
  head: ref,
  base: ref,
  title: z.string().trim().min(1).max(256),
  body: z.string().max(65_536),
  draft: z.boolean(),
})

export const comment = z.string().trim().min(1).max(65_536)

export const spawnRequest: z.ZodType<SpawnRequest> = z.object({
  id,
  profileId: id,
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
  cwd: path.optional(),
  initialInput: z.string().max(1000).optional(),
})

export const terminalSize = z.number().int().min(1).max(1000)
export const terminalInput = z.string().max(1_000_000)

export const settings = z.object({
  language: z.enum(['system', ...LOCALE_IDS]),
  panelPosition: z.enum(['left', 'right']),
  terminalCursorStyle: z.enum(['block', 'bar', 'underline']),
  terminalCursorBlink: z.boolean(),
  diffSideBySide: z.boolean(),
}) satisfies z.ZodType<Settings>

export const settingsPatch = settings.partial().strict()

export const grantedPermissions: z.ZodType<GrantablePermissions> = z
  .object({
    network: z.array(z.string().refine(isOriginPattern)).max(50).optional(),
    workspace: z.literal('read').optional(),
    repoFiles: z.array(z.string().refine(isRepoGlob)).max(20).optional(),
  })
  .strict()
