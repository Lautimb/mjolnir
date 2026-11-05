import { z } from 'zod'
import { isOriginPattern } from './permissions'
import { isRepoGlob } from './repo-paths'
import { LOCALIZED } from './strings'

export const MANIFEST_FILE = 'mjolnir-plugin.json'

const SEGMENT = /^[A-Za-z0-9._-]+$/

export function isSafeRelativePath(path: string): boolean {
  const segments = path.split('/')
  return segments.every((segment) => SEGMENT.test(segment) && segment !== '.' && segment !== '..')
}

const slug = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const version = z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/)
const text = z.string().trim().min(1).max(200)
const file = z.string().max(256).refine(isSafeRelativePath, 'must be a relative path inside the plugin')

const view = z
  .object({
    id: slug,
    title: text,
    icon: file.optional(),
    entry: file,
  })
  .strict()

export const manifestSchema = z
  .object({
    $schema: z.string().optional(),
    id: slug,
    version,
    engines: z
      .object({
        mjolnir: z.string().regex(/^>=\d+\.\d+\.\d+$/),
        api: z.number().int().positive(),
      })
      .strict(),
    name: text,
    description: z.string().trim().max(500).optional(),
    locales: z.record(z.string().regex(/^[a-z]{2}$/), file).optional(),
    contributes: z
      .object({
        views: z.array(view).max(20).default([]),
      })
      .strict()
      .default({ views: [] }),
    permissions: z
      .object({
        network: z.array(z.string().refine(isOriginPattern, 'must be an origin like https://host or https://*.host, or *')).max(50).optional(),
        workspace: z.literal('read').optional(),
        repoFiles: z.array(z.string().refine(isRepoGlob, 'must be a glob relative to the repo, outside .git')).min(1).max(20).optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = manifest.contributes.views.map((entry) => entry.id)
    if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['contributes', 'views'], message: 'view ids must be unique' })
  })

export type PluginManifest = z.infer<typeof manifestSchema>

export type PluginPermissions = PluginManifest['permissions']

export type ViewContribution = PluginManifest['contributes']['views'][number]

export type ManifestResult = { ok: true; manifest: PluginManifest } | { ok: false; issue: string }

export function parseManifest(raw: unknown): ManifestResult {
  const result = manifestSchema.safeParse(raw)
  if (result.success) return { ok: true, manifest: result.data }
  const [first] = result.error.issues
  return { ok: false, issue: first ? `${first.path.join('.') || '(root)'}: ${first.message}` : 'invalid manifest' }
}

function parseVersion(value: string): number[] {
  return value
    .replace(/^>=/, '')
    .split('-')[0]!
    .split('.')
    .map((part) => Number(part))
}

export function satisfiesMinimum(range: string, appVersion: string): boolean {
  const minimum = parseVersion(range)
  const actual = parseVersion(appVersion)
  for (let index = 0; index < 3; index++) {
    const difference = (actual[index] ?? 0) - (minimum[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return true
}

export type Compatibility = { ok: true } | { ok: false; reason: 'app'; required: string } | { ok: false; reason: 'api'; required: number }

export function checkCompatibility(manifest: PluginManifest, host: { appVersion: string; apiVersions: readonly number[] }): Compatibility {
  if (!host.apiVersions.includes(manifest.engines.api)) return { ok: false, reason: 'api', required: manifest.engines.api }
  if (!satisfiesMinimum(manifest.engines.mjolnir, host.appVersion)) return { ok: false, reason: 'app', required: manifest.engines.mjolnir }
  return { ok: true }
}

export function localizedKeys(manifest: PluginManifest): string[] {
  const texts = [manifest.name, manifest.description ?? '', ...manifest.contributes.views.map((entry) => entry.title)]
  return [...new Set(texts.flatMap((value) => LOCALIZED.exec(value)?.[1] ?? []))]
}
