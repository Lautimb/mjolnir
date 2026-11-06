import { z } from 'zod'
import { isSafeRef, type CreatePullRequestInput, type FileChange, type Host, type PullRequestQuery } from '@mjolnir/core'
import { isOriginPattern, isRepoGlob, type GrantablePermissions } from '@mjolnir/plugin-sdk'
import type { SavedTabs, SpawnRequest } from '../shared/api'
import { LOCALE_IDS } from '../shared/locales'
import { TERMINAL_FONT_SIZE, type Settings } from '../shared/settings'
import { ZOOM_LEVELS } from '../shared/zoom'

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

export const MAX_SAVED_TABS = 200

export const savedTabs: z.ZodType<SavedTabs> = z.object({
  tabs: z
    .array(
      z.object({
        id,
        sessionKey: z.string().min(1).max(MAX_PATH),
        kind: z.enum(['shell', 'agent']),
        profileId: id,
        label,
        agent: id.optional(),
        conversation: z.uuid().optional(),
      }),
    )
    .max(MAX_SAVED_TABS),
  active: z.record(z.string().max(MAX_PATH), id),
})

export const terminalSize = z.number().int().min(1).max(1000)
export const terminalInput = z.string().max(1_000_000)

export const settings = z.object({
  language: z.enum(['system', ...LOCALE_IDS]),
  panelPosition: z.enum(['left', 'right']),
  zoom: z.number().min(ZOOM_LEVELS[0]).max(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]!),
  terminalCursorStyle: z.enum(['block', 'bar', 'underline']),
  terminalCursorBlink: z.boolean(),
  terminalFontSize: z.number().int().min(TERMINAL_FONT_SIZE.min).max(TERMINAL_FONT_SIZE.max),
  diffSideBySide: z.boolean(),
  diffTree: z.boolean(),
  hiddenPluginViews: z.array(z.string().max(300)).max(1000),
}) satisfies z.ZodType<Settings>

export const settingsPatch = settings.partial().strict()

export const portRole = z.enum(['view', 'background'])

export const grantedPermissions: z.ZodType<GrantablePermissions> = z
  .object({
    network: z.array(z.string().refine(isOriginPattern)).max(50).optional(),
    workspace: z.literal('read').optional(),
    repoFiles: z.array(z.string().refine(isRepoGlob)).max(20).optional(),
    accounts: z.array(z.string().min(1).max(200)).max(10).optional(),
    cli: z.array(z.string().max(5000)).max(5).optional(),
  })
  .strict()
