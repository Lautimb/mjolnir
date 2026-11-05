import { useState } from 'react'
import { FolderOpen, Package, Pin, PinOff, Puzzle, Trash2 } from 'lucide-react'
import { hasPermissions, requestedPermissions } from '@mjolnir/plugin-sdk'
import type { PluginInfo } from '../../../shared/api'
import { describeError, useI18n, type T } from '../i18n/I18nProvider'
import { Badge, type Tone } from '../ui/Badge'
import { Button, IconButton } from '../ui/Button'
import { Description } from '../ui/Description'
import { EmptyState } from '../ui/EmptyState'
import { FormError } from '../ui/fields'
import { describePermissions, pluginName, pluginText, pluginViews, type PluginViewKey } from './model'

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

const confirmPermissions = (lines: string[], message: (permissions: string) => string) =>
  !lines.length || confirm(message(lines.map((line) => `• ${line}`).join('\n')))

interface RowProps {
  plugin: PluginInfo
  hiddenViews: string[]
  onToggleView(key: PluginViewKey, visible: boolean): void
  onOpenView(key: PluginViewKey): void
  onError(error: unknown): void
}

function PluginRow({ plugin, hiddenViews, onToggleView, onOpenView, onError }: RowProps) {
  const { t, locale } = useI18n()
  const { plugins } = window.mjolnir
  const name = pluginName(plugin, locale)
  const description = plugin.manifest?.description ? pluginText(plugin, plugin.manifest.description, locale) : null
  const requested = describePermissions(t, plugin.manifest ? requestedPermissions(plugin.manifest) : {})
  const badge = status(t, plugin)
  const usable = plugin.status.kind === 'ready'
  const { source, update } = plugin
  const views = pluginViews([plugin])

  const enable = () => {
    const pending = describePermissions(t, plugin.pending)
    if (confirmPermissions(pending, (permissions) => t('plugins.confirmPermissions', { name, permissions }))) plugins.enable(plugin.id, plugin.pending).catch(onError)
  }

  const applyUpdate = () => {
    if (!update) return
    const pending = describePermissions(t, update.pending)
    if (confirmPermissions(pending, (permissions) => t('plugins.update.confirm', { name, version: update.version, permissions }))) {
      plugins.applyUpdate(plugin.id, update.pending).catch(onError)
    }
  }

  const remove = () => {
    const message = source.kind === 'package' ? t('plugins.confirmUninstall', { name }) : t('plugins.confirmRemove', { name })
    if (confirm(message)) plugins.remove(plugin.id).catch(onError)
  }

  return (
    <li className="flex flex-col gap-2 border-b border-line py-3">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{name}</span>
            {plugin.manifest && <span className="text-sm text-subtle">{plugin.manifest.version}</span>}
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {source.kind === 'package' && <Badge tone="muted">{t('plugins.unverified')}</Badge>}
          </div>
          {description && <Description>{description}</Description>}
          <div className="mt-1 text-sm text-subtle">{requested.length ? requested.join(' · ') : t('plugins.permissions.none')}</div>
          {source.kind === 'folder' ? (
            <div className="truncate font-mono text-xs text-subtle" title={source.path}>
              {source.path}
            </div>
          ) : (
            <div className="text-xs text-subtle" title={`sha256 ${source.sha256}`}>
              {t('plugins.installedFromFile')}
            </div>
          )}
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
      </div>
      {update && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-accent/12 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">{t('plugins.update.available', { version: update.version })}</span>
          <Button variant="primary" onClick={applyUpdate}>
            {t('plugins.update.apply')}
          </Button>
          <Button variant="ghost" onClick={() => plugins.discardUpdate(plugin.id).catch(onError)}>
            {t('plugins.update.discard')}
          </Button>
        </div>
      )}
      {views.length > 0 && (
        <ul className="flex flex-col">
          {views.map(({ key, view }) => {
            const visible = !hiddenViews.includes(key)
            return (
              <li key={key} className="flex items-center gap-2 text-sm">
                <button type="button" className="text-accent hover:underline" onClick={() => onOpenView(key)}>
                  {pluginText(plugin, view.title, locale)}
                </button>
                <span className="text-xs text-subtle">{visible ? t('plugins.views.pinned') : t('plugins.views.unpinned')}</span>
                <IconButton
                  small
                  aria-label={visible ? t('plugins.views.unpin') : t('plugins.views.pin')}
                  title={visible ? t('plugins.views.unpin') : t('plugins.views.pin')}
                  onClick={() => onToggleView(key, !visible)}
                >
                  {visible ? <PinOff size={12} /> : <Pin size={12} />}
                </IconButton>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

interface Props {
  plugins: PluginInfo[]
  hiddenViews: string[]
  onHiddenViewsChange(hiddenViews: string[]): void
  onOpenView(key: PluginViewKey): void
}

export function PluginsView({ plugins, hiddenViews, onHiddenViewsChange, onOpenView }: Props) {
  const { t } = useI18n()
  const [error, setError] = useState<unknown>(null)

  const run = (action: () => Promise<unknown>) => {
    setError(null)
    action().catch(setError)
  }

  const toggleView = (key: PluginViewKey, visible: boolean) =>
    onHiddenViewsChange(visible ? hiddenViews.filter((hidden) => hidden !== key) : [...new Set([...hiddenViews, key])])

  return (
    <div className="col-[2/4] row-start-2 overflow-y-auto bg-canvas panel-right:col-[1/3]">
      <div className="mx-auto max-w-[720px] px-6 py-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{t('plugins.title')}</h1>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => run(() => window.mjolnir.plugins.installFile(t('plugins.installFileTitle'), t('plugins.packageFilter')))}>
              <Package size={14} />
              {t('plugins.installFile')}
            </Button>
            <Button onClick={() => run(() => window.mjolnir.plugins.addFolder(t('plugins.loadFolderTitle')))}>
              <FolderOpen size={14} />
              {t('plugins.loadFolder')}
            </Button>
          </div>
        </div>
        <div className="mb-6">
          <Description>{t('plugins.description')}</Description>
        </div>
        {!!error && <FormError>{describeError(t, error)}</FormError>}
        {plugins.length ? (
          <ul>
            {plugins.map((plugin) => (
              <PluginRow key={plugin.id} plugin={plugin} hiddenViews={hiddenViews} onToggleView={toggleView} onOpenView={onOpenView} onError={setError} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Puzzle size={28} />}>{t('plugins.empty')}</EmptyState>
        )}
      </div>
    </div>
  )
}
