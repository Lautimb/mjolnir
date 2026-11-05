import { useCallback, useEffect, useState } from 'react'
import { Download, FolderOpen, Package, Pin, PinOff, Puzzle, RefreshCw, Store, Trash2 } from 'lucide-react'
import { hasPermissions, requestedPermissions } from '@mjolnir/plugin-sdk'
import type { CatalogPlugin, PluginCatalogState, PluginInfo, PluginSource } from '../../../shared/api'
import { describeError, useI18n, type T } from '../i18n/I18nProvider'
import { Badge, type Tone } from '../ui/Badge'
import { Button, IconButton } from '../ui/Button'
import { Description } from '../ui/Description'
import { EmptyState } from '../ui/EmptyState'
import { FormError } from '../ui/fields'
import { Segmented } from '../ui/Segmented'
import { catalogUpdate, describePermissions, pluginName, pluginText, pluginViews, type PluginViewKey } from './model'

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

function enablePlugin(t: T, plugin: PluginInfo, name: string): Promise<void> {
  const pending = describePermissions(t, plugin.pending)
  if (!confirmPermissions(pending, (permissions) => t('plugins.confirmPermissions', { name, permissions }))) return Promise.resolve()
  return window.mjolnir.plugins.enable(plugin.id, plugin.pending)
}

function SourceBadge({ source }: { source: PluginSource }) {
  const { t } = useI18n()
  if (source.kind !== 'package') return null
  return source.verified ? <Badge tone="success">{t('plugins.verified')}</Badge> : <Badge tone="muted">{t('plugins.unverified')}</Badge>
}

function useCatalog() {
  const [state, setState] = useState<PluginCatalogState | null>(null)
  const [loading, setLoading] = useState(false)
  const load = useCallback((refresh: boolean) => {
    setLoading(true)
    window.mjolnir.plugins
      .catalog(refresh)
      .then(setState)
      .catch(() => setState((current) => (current ? { ...current, failed: true } : { plugins: [], fetchedAt: null, failed: true })))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => load(false), [load])
  return { state, loading, refresh: () => load(true) }
}

interface RowProps {
  plugin: PluginInfo
  available: CatalogPlugin | undefined
  hiddenViews: string[]
  onToggleView(key: PluginViewKey, visible: boolean): void
  onOpenView(key: PluginViewKey): void
  onError(error: unknown): void
}

function PluginRow({ plugin, available, hiddenViews, onToggleView, onOpenView, onError }: RowProps) {
  const { t, locale } = useI18n()
  const { plugins } = window.mjolnir
  const name = pluginName(plugin, locale)
  const description = plugin.manifest?.description ? pluginText(plugin, plugin.manifest.description, locale) : null
  const requested = describePermissions(t, plugin.manifest ? requestedPermissions(plugin.manifest) : {})
  const badge = status(t, plugin)
  const usable = plugin.status.kind === 'ready'
  const { source, update } = plugin
  const views = pluginViews([plugin])
  const newer = catalogUpdate(plugin, available)
  const [updating, setUpdating] = useState(false)

  const enable = () => void enablePlugin(t, plugin, name).catch(onError)

  const updateFromCatalog = () => {
    setUpdating(true)
    plugins
      .installFromCatalog(plugin.id)
      .catch(onError)
      .finally(() => setUpdating(false))
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
            <SourceBadge source={source} />
          </div>
          {description && <Description>{description}</Description>}
          <div className="mt-1 text-sm text-subtle">{requested.length ? requested.join(' · ') : t('plugins.permissions.none')}</div>
          {source.kind === 'folder' ? (
            <div className="truncate font-mono text-xs text-subtle" title={source.path}>
              {source.path}
            </div>
          ) : (
            <div className="text-xs text-subtle" title={`sha256 ${source.sha256}`}>
              {source.origin === 'catalog' ? t('plugins.installedFromCatalog') : t('plugins.installedFromFile')}
            </div>
          )}
        </div>
        <div className="flex flex-none items-center gap-1">
          {newer && (
            <Button variant="primary" disabled={updating} onClick={updateFromCatalog}>
              <Download size={14} />
              {updating ? t('plugins.catalog.installing') : t('plugins.catalog.updateTo', { version: newer.version })}
            </Button>
          )}
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

interface CatalogRowProps {
  entry: CatalogPlugin
  onInstalled(plugin: PluginInfo): void
  onError(error: unknown): void
}

function CatalogRow({ entry, onInstalled, onError }: CatalogRowProps) {
  const { t, locale } = useI18n()
  const [installing, setInstalling] = useState(false)
  const name = pluginName(entry, locale)
  const description = entry.manifest.description ? pluginText(entry, entry.manifest.description, locale) : null
  const requested = describePermissions(t, requestedPermissions(entry.manifest))
  const { status } = entry

  const install = () => {
    setInstalling(true)
    window.mjolnir.plugins
      .installFromCatalog(entry.id)
      .then(async (plugin) => {
        onInstalled(plugin)
        await enablePlugin(t, plugin, name)
      })
      .catch(onError)
      .finally(() => setInstalling(false))
  }

  return (
    <li className="flex items-start gap-4 border-b border-line py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{name}</span>
          <span className="text-sm text-subtle">{entry.version}</span>
          {entry.verified ? <Badge tone="success">{t('plugins.verified')}</Badge> : <Badge tone="muted">{t('plugins.unverified')}</Badge>}
          {status.kind === 'incompatible' && (
            <Badge tone="danger">
              {status.reason === 'app' ? t('plugins.status.incompatibleApp', { required: status.required }) : t('plugins.status.incompatibleApi', { required: status.required })}
            </Badge>
          )}
        </div>
        {description && <Description>{description}</Description>}
        <div className="mt-1 text-sm text-subtle">{requested.length ? requested.join(' · ') : t('plugins.permissions.none')}</div>
      </div>
      <Button variant="primary" disabled={installing || status.kind !== 'ready'} onClick={install}>
        <Download size={14} />
        {installing ? t('plugins.catalog.installing') : t('plugins.catalog.install')}
      </Button>
    </li>
  )
}

type Tab = 'installed' | 'available'

interface Props {
  plugins: PluginInfo[]
  hiddenViews: string[]
  onHiddenViewsChange(hiddenViews: string[]): void
  onOpenView(key: PluginViewKey): void
}

export function PluginsView({ plugins, hiddenViews, onHiddenViewsChange, onOpenView }: Props) {
  const { t } = useI18n()
  const [error, setError] = useState<unknown>(null)
  const catalog = useCatalog()
  const installedIds = new Set(plugins.map((plugin) => plugin.id))
  const available = catalog.state?.plugins.filter((entry) => !installedIds.has(entry.id)) ?? []
  const [tab, setTab] = useState<Tab>(plugins.length ? 'installed' : 'available')

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
        <div className="mb-2 flex items-center gap-2">
          <Segmented
            label={t('plugins.title')}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'installed', label: t('plugins.tabs.installed', { count: plugins.length }) },
              { value: 'available', label: t('plugins.tabs.available', { count: available.length }) },
            ]}
          />
          <span className="min-w-0 flex-1 truncate text-sm text-subtle">{catalog.state?.failed ? t('plugins.catalog.failed') : null}</span>
          <IconButton aria-label={t('common.refresh')} title={t('common.refresh')} disabled={catalog.loading} onClick={catalog.refresh}>
            <RefreshCw size={14} className={catalog.loading ? 'animate-spin' : undefined} />
          </IconButton>
        </div>
        {!!error && <FormError>{describeError(t, error)}</FormError>}
        {tab === 'installed' ? (
          plugins.length ? (
            <ul>
              {plugins.map((plugin) => (
                <PluginRow
                  key={plugin.id}
                  plugin={plugin}
                  available={catalog.state?.plugins.find((entry) => entry.id === plugin.id)}
                  hiddenViews={hiddenViews}
                  onToggleView={toggleView}
                  onOpenView={onOpenView}
                  onError={setError}
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Puzzle size={28} />}>{t('plugins.empty')}</EmptyState>
          )
        ) : available.length ? (
          <ul>
            {available.map((entry) => (
              <CatalogRow key={entry.id} entry={entry} onInstalled={() => setTab('installed')} onError={setError} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Store size={28} />}>{catalog.loading && !catalog.state ? t('plugins.catalog.loading') : t('plugins.catalog.empty')}</EmptyState>
        )}
      </div>
    </div>
  )
}
