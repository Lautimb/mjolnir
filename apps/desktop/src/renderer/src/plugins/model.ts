import { compareVersions, localize, PLUGIN_SCHEME, type GrantablePermissions, type NewSessionRequest, type SessionTicket } from '@mjolnir/plugin-sdk'
import type { PluginManifest, ViewContribution } from '@mjolnir/plugin-sdk/manifest'
import type { CatalogPlugin, PluginInfo } from '../../../shared/api'
import { FALLBACK_LOCALE, SOURCE_LOCALE } from '../../../shared/locales'
import type { T } from '../i18n/I18nProvider'

export type PluginViewKey = `plugin:${string}/${string}`

export interface PluginView {
  key: PluginViewKey
  plugin: PluginInfo
  view: ViewContribution
}

export const MOUNTED_VIEWS = 3

const MAX_ID = 200
const MAX_BRANCH = 250
const MAX_TITLE = 500
const MAX_URL = 2000
const MAX_DESCRIPTION = 8000

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined
}

function asTicket(data: unknown): SessionTicket | undefined {
  const ticket = data as { id?: unknown; title?: unknown; url?: unknown; description?: unknown } | null
  const id = text(ticket?.id, MAX_ID)
  const title = text(ticket?.title, MAX_TITLE)
  if (!id || !title) return undefined
  const url = text(ticket?.url, MAX_URL)
  const description = text(ticket?.description, MAX_DESCRIPTION)
  return { id, title, ...(url && /^https?:\/\//i.test(url) && { url }), ...(description && { description }) }
}

export function asNewSession(data: unknown): NewSessionRequest | null {
  const message = data as { type?: unknown; repoId?: unknown; branch?: unknown; ticket?: unknown } | null
  if (message?.type !== 'mjolnir:newSession') return null
  const { repoId, branch } = message
  if (typeof repoId !== 'string' || typeof branch !== 'string' || !repoId || repoId.length > MAX_ID) return null
  const ticket = asTicket(message.ticket)
  return { repoId, branch: branch.trim().slice(0, MAX_BRANCH), ...(ticket && { ticket }) }
}

export function pluginOrigin(pluginId: string): string {
  return `${PLUGIN_SCHEME}://${pluginId}`
}

export function pluginUrl(plugin: PluginInfo, file: string): string {
  return `${pluginOrigin(plugin.id)}/${file}?r=${plugin.revision}`
}

export function pluginViews(plugins: PluginInfo[]): PluginView[] {
  return plugins.flatMap((plugin) =>
    plugin.active && plugin.manifest
      ? plugin.manifest.contributes.views.map((view) => ({ key: `plugin:${plugin.id}/${view.id}` as const, plugin, view }))
      : [],
  )
}

interface Localizable {
  id: string
  manifest: PluginManifest | null
  strings: Record<string, Record<string, string>>
}

export function pluginText(plugin: Localizable, value: string, locale: string): string {
  const { strings } = plugin
  return localize(value, { ...strings[SOURCE_LOCALE], ...strings[FALLBACK_LOCALE], ...strings[locale] })
}

export function pluginName(plugin: Localizable, locale: string): string {
  return plugin.manifest ? pluginText(plugin, plugin.manifest.name, locale) : plugin.id
}

export function describePermissions(t: T, permissions: GrantablePermissions): string[] {
  const network = permissions.network ?? []
  const repoFiles = permissions.repoFiles ?? []
  return [
    ...(network.length ? [network.includes('*') ? t('plugins.permissions.networkAny') : t('plugins.permissions.network', { origins: network.join(', ') })] : []),
    ...(permissions.workspace ? [t('plugins.permissions.workspace')] : []),
    ...(repoFiles.length ? [t('plugins.permissions.repoFiles', { globs: repoFiles.join(', ') })] : []),
    ...(permissions.accounts?.length ? [t('plugins.permissions.accounts', { providers: permissions.accounts.join(', ') })] : []),
    ...(permissions.cli ?? []).map((command) => t('plugins.permissions.cli', { command })),
  ]
}

export function touch(keys: PluginViewKey[], key: PluginViewKey, limit = MOUNTED_VIEWS): PluginViewKey[] {
  return [key, ...keys.filter((existing) => existing !== key)].slice(0, limit)
}

export function catalogUpdate(plugin: PluginInfo, available: CatalogPlugin | undefined): CatalogPlugin | null {
  if (!available || plugin.source.kind !== 'package' || available.status.kind !== 'ready') return null
  const newest = plugin.update && compareVersions(plugin.update.version, plugin.source.version) > 0 ? plugin.update.version : plugin.source.version
  return compareVersions(available.version, newest) > 0 ? available : null
}
