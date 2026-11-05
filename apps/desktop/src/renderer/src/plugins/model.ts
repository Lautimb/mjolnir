import { localize, PLUGIN_SCHEME, type GrantablePermissions } from '@mjolnir/plugin-sdk'
import type { ViewContribution } from '@mjolnir/plugin-sdk/manifest'
import type { PluginInfo } from '../../../shared/api'
import { FALLBACK_LOCALE, SOURCE_LOCALE } from '../../../shared/locales'
import type { T } from '../i18n/I18nProvider'

export type PluginViewKey = `plugin:${string}/${string}`

export interface PluginView {
  key: PluginViewKey
  plugin: PluginInfo
  view: ViewContribution
}

export const MOUNTED_VIEWS = 3

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

export function pluginText(plugin: PluginInfo, value: string, locale: string): string {
  const { strings } = plugin
  return localize(value, { ...strings[SOURCE_LOCALE], ...strings[FALLBACK_LOCALE], ...strings[locale] })
}

export function pluginName(plugin: PluginInfo, locale: string): string {
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
