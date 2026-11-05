import { useState } from 'react'
import { FolderOpen, Puzzle, Trash2 } from 'lucide-react'
import { hasPermissions } from '@mjolnir/plugin-sdk'
import type { PluginInfo } from '../../../shared/api'
import { describeError, useI18n, type T } from '../i18n/I18nProvider'
import { Badge, type Tone } from '../ui/Badge'
import { Button, IconButton } from '../ui/Button'
import { Description } from '../ui/Description'
import { EmptyState } from '../ui/EmptyState'
import { FormError } from '../ui/fields'
import { describePermissions, pluginName, pluginText } from './model'

function status(t: T, plugin: PluginInfo): { tone: Tone; label: string } {
  const { status } = plugin
  if (status.kind === 'missing') return { tone: 'danger', label: t('plugins.status.missing') }
  if (status.kind === 'invalid') return { tone: 'danger', label: t('plugins.status.invalid', { issue: status.issue }) }
  if (status.kind === 'incompatible') {
    const label = status.reason === 'app' ? t('plugins.status.incompatibleApp', { required: status.required }) : t('plugins.status.incompatibleApi', { required: status.required })
    return { tone: 'danger', label }
  }
  if (plugin.active) return { tone: 'success', label: t('plugins.status.active') }
  if (plugin.enabled && hasPermissions(plugin.pending)) return { tone: 'accent', label: t('plugins.status.pending') }
  return { tone: 'muted', label: t('plugins.status.disabled') }
}

function PluginRow({ plugin, onError }: { plugin: PluginInfo; onError(error: unknown): void }) {
  const { t, locale } = useI18n()
  const { plugins } = window.mjolnir
  const name = pluginName(plugin, locale)
  const description = plugin.manifest?.description ? pluginText(plugin, plugin.manifest.description, locale) : null
  const requested = describePermissions(t, plugin.manifest?.permissions ?? {})
  const badge = status(t, plugin)
  const usable = plugin.status.kind === 'ready'

  const enable = () => {
    const pending = describePermissions(t, plugin.pending)
    if (pending.length && !confirm(t('plugins.confirmPermissions', { name, permissions: pending.map((line) => `• ${line}`).join('\n') }))) return
    plugins.enable(plugin.id, plugin.pending).catch(onError)
  }

  const remove = () => {
    if (confirm(t('plugins.confirmRemove', { name }))) plugins.remove(plugin.id).catch(onError)
  }

  return (
    <li className="flex items-start gap-4 border-b border-line py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{name}</span>
          {plugin.manifest && <span className="text-sm text-subtle">{plugin.manifest.version}</span>}
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        {description && <Description>{description}</Description>}
        <div className="mt-1 text-sm text-subtle">{requested.length ? requested.join(' · ') : t('plugins.permissions.none')}</div>
        <div className="truncate font-mono text-xs text-subtle" title={plugin.source.path}>
          {plugin.source.path}
        </div>
      </div>
      <div className="flex flex-none items-center gap-1">
        {plugin.active || (plugin.enabled && !usable) ? (
          <Button onClick={() => plugins.disable(plugin.id).catch(onError)}>{t('plugins.disable')}</Button>
        ) : (
          <Button variant="primary" disabled={!usable} onClick={enable}>
            {t('plugins.enable')}
          </Button>
        )}
        <IconButton danger aria-label={t('plugins.remove')} title={t('plugins.remove')} onClick={remove}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </li>
  )
}

export function PluginsView({ plugins }: { plugins: PluginInfo[] }) {
  const { t } = useI18n()
  const [error, setError] = useState<unknown>(null)

  const addFolder = () => {
    setError(null)
    window.mjolnir.plugins.addFolder(t('plugins.loadFolderTitle')).catch(setError)
  }

  return (
    <div className="col-[2/4] row-start-2 overflow-y-auto bg-canvas panel-right:col-[1/3]">
      <div className="mx-auto max-w-[720px] px-6 py-8">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{t('plugins.title')}</h1>
          <Button onClick={addFolder}>
            <FolderOpen size={14} />
            {t('plugins.loadFolder')}
          </Button>
        </div>
        <div className="mb-6">
          <Description>{t('plugins.description')}</Description>
        </div>
        {!!error && <FormError>{describeError(t, error)}</FormError>}
        {plugins.length ? (
          <ul>
            {plugins.map((plugin) => (
              <PluginRow key={plugin.id} plugin={plugin} onError={setError} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Puzzle size={28} />}>{t('plugins.empty')}</EmptyState>
        )}
      </div>
    </div>
  )
}
