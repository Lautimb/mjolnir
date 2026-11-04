import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { CornerDownLeft, FolderGit2, FolderOpen, FolderSearch, Loader2 } from 'lucide-react'
import { hostKey, sameHost, type DiscoveredRepos, type Host, type Repo } from '@mjolnir/core/browser'
import { describeError, hostLabel, useI18n } from './i18n/I18nProvider'

type Discovery = { status: 'loading' } | { status: 'ready'; result: DiscoveredRepos } | { status: 'error'; error: unknown }

interface Item {
  path: string
  name: string
  typed: boolean
}

interface Props {
  existing: Repo[]
  onAdd(request: () => Promise<Repo | null>): Promise<boolean>
  onClose(): void
}

const MAX_ITEMS = 50

function looksLikePath(query: string): boolean {
  return /^(\/|~\/|[a-zA-Z]:[\\/]|\\\\)/.test(query)
}

export function AddRepoDialog({ existing, onAdd, onClose }: Props) {
  const { t } = useI18n()
  const [hosts, setHosts] = useState<Host[]>([])
  const [host, setHost] = useState<Host | null>(null)
  const [discoveries, setDiscoveries] = useState<Record<string, Discovery>>({})
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void window.mjolnir.repos.hosts().then((list) => {
      setHosts(list)
      setHost(list[0] ?? null)
    })
  }, [])

  useEffect(() => {
    if (!host) return
    const key = hostKey(host)
    if (discoveries[key]) return
    setDiscoveries((current) => ({ ...current, [key]: { status: 'loading' } }))
    window.mjolnir.repos.discover(host).then(
      (result) => setDiscoveries((current) => ({ ...current, [key]: { status: 'ready', result } })),
      (error: unknown) => setDiscoveries((current) => ({ ...current, [key]: { status: 'error', error } })),
    )
  }, [host, discoveries])

  const discovery = host ? discoveries[hostKey(host)] : undefined
  const home = discovery?.status === 'ready' ? discovery.result.home : ''

  const items = useMemo<Item[]>(() => {
    const trimmed = query.trim()
    const typed: Item[] = looksLikePath(trimmed)
      ? [{ path: trimmed.replace(/^~(?=\/)/, home), name: trimmed, typed: true }]
      : []
    const repos = discovery?.status === 'ready' ? discovery.result.repos : []
    const terms = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
    const matches = repos
      .filter((path) => typed.length > 0 || terms.every((term) => path.toLowerCase().includes(term)))
      .filter((path) => typed.length === 0 || path.startsWith(typed[0]!.path))
      .slice(0, MAX_ITEMS)
      .map((path) => ({ path, name: path.split(/[\\/]/).pop() ?? path, typed: false }))
    return [...typed, ...matches]
  }, [query, discovery, home])

  useEffect(() => setSelected(0), [query, host])

  const shorten = (path: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path)
  const isAdded = (path: string) => !!host && existing.some((repo) => sameHost(repo.host, host) && repo.path === path)

  const run = async (request: () => Promise<Repo | null>) => {
    setBusy(true)
    setError(null)
    try {
      await onAdd(request)
    } catch (err) {
      setError(describeError(t, err))
    } finally {
      setBusy(false)
    }
  }

  const add = (item: Item | undefined) => {
    if (item && host && !busy) void run(() => window.mjolnir.repos.add(host, item.path))
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') onClose()
    else if (event.key === 'ArrowDown') setSelected((i) => Math.min(i + 1, items.length - 1))
    else if (event.key === 'ArrowUp') setSelected((i) => Math.max(i - 1, 0))
    else if (event.key === 'Enter') add(items[selected])
    else return
    event.preventDefault()
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" role="dialog" aria-label={t('addRepo.title')} onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="dialog-header">
          <span>{t('addRepo.title')}</span>
          {hosts.length > 1 && (
            <div className="segmented">
              {hosts.map((option) => (
                <button
                  key={hostKey(option)}
                  className={host && sameHost(host, option) ? 'selected' : undefined}
                  onClick={() => setHost(option)}
                >
                  {hostLabel(t, option)}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="dialog-search">
          <FolderSearch size={16} />
          <input
            autoFocus
            placeholder={host?.kind === 'windows' ? t('addRepo.placeholderWindows') : t('addRepo.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
          />
          {busy && <Loader2 size={15} className="spin" />}
        </div>

        <div className="dialog-list">
          {discovery?.status === 'loading' && (
            <div className="dialog-hint">
              <Loader2 size={14} className="spin" /> {t('addRepo.searching', { host: host ? hostLabel(t, host) : '' })}
            </div>
          )}
          {discovery?.status === 'error' && <div className="dialog-hint error">{describeError(t, discovery.error)}</div>}
          {discovery?.status === 'ready' && items.length === 0 && (
            <div className="dialog-hint">
              {host?.kind === 'windows'
                ? t('addRepo.windowsNoScan')
                : query
                  ? t('addRepo.noMatch')
                  : t('addRepo.noneFound', { path: shorten(home) || '~' })}
            </div>
          )}
          {items.map((item, index) => (
            <button
              key={`${item.typed}:${item.path}`}
              className={`dialog-item${index === selected ? ' selected' : ''}`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => add(item)}
            >
              <FolderGit2 size={15} />
              <span className="dialog-item-name">{item.typed ? t('addRepo.addPath') : item.name}</span>
              <span className="dialog-item-path">{shorten(item.path)}</span>
              {isAdded(item.path) && <span className="dialog-item-badge">{t('addRepo.added')}</span>}
              {index === selected && <CornerDownLeft size={13} className="dialog-item-enter" />}
            </button>
          ))}
        </div>

        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-footer">
          <button className="button ghost" disabled={!host || busy} onClick={() => host && void run(() => window.mjolnir.repos.browse(host, t('addRepo.title')))}>
            <FolderOpen size={14} />
            {t('addRepo.browse')}
          </button>
          <span className="dialog-keys">{t('addRepo.keys')}</span>
        </div>
      </div>
    </div>
  )
}
