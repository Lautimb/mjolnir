import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CornerDownLeft, FolderGit2, FolderOpen, FolderSearch, Loader2 } from 'lucide-react'
import { hostKey, sameHost, type DiscoveredRepos, type Host, type Repo } from '@mjolnir/core/browser'
import { describeError, hostLabel, useI18n } from '../i18n/I18nProvider'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { popover } from '../ui/Menu'
import { Segmented } from '../ui/Segmented'

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

function Hint({ error, children }: { error?: boolean; children: ReactNode }) {
  return <div className={cx('flex items-center gap-2 p-3 text-sm', error ? 'text-danger' : 'text-muted')}>{children}</div>
}

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
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-scrim px-4 pt-[12vh] pb-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t('addRepo.title')}
        className={cx(popover, 'flex max-h-full w-[min(620px,100%)] flex-col overflow-hidden rounded-lg')}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 font-semibold">
          <span>{t('addRepo.title')}</span>
          {hosts.length > 1 && host && (
            <Segmented
              value={hostKey(host)}
              options={hosts.map((option) => ({ value: hostKey(option), label: hostLabel(t, option) }))}
              onChange={(key) => setHost(hosts.find((option) => hostKey(option) === key) ?? null)}
            />
          )}
        </div>

        <div className="mx-3 flex items-center gap-2 rounded-md border border-line-strong bg-canvas px-3 text-subtle focus-within:border-accent">
          <FolderSearch size={16} />
          <input
            className="h-[38px] flex-1 bg-transparent text-lg text-fg outline-none"
            autoFocus
            placeholder={host?.kind === 'windows' ? t('addRepo.placeholderWindows') : t('addRepo.placeholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
          />
          {busy && <Loader2 size={15} className="animate-spin" />}
        </div>

        <div className="max-h-[380px] min-h-[120px] overflow-y-auto p-2">
          {discovery?.status === 'loading' && (
            <Hint>
              <Loader2 size={14} className="animate-spin" /> {t('addRepo.searching', { host: host ? hostLabel(t, host) : '' })}
            </Hint>
          )}
          {discovery?.status === 'error' && <Hint error>{describeError(t, discovery.error)}</Hint>}
          {discovery?.status === 'ready' && items.length === 0 && (
            <Hint>
              {host?.kind === 'windows'
                ? t('addRepo.windowsNoScan')
                : query
                  ? t('addRepo.noMatch')
                  : t('addRepo.noneFound', { path: shorten(home) || '~' })}
            </Hint>
          )}
          {items.map((item, index) => {
            const isSelected = index === selected
            return (
              <button
                key={`${item.typed}:${item.path}`}
                className={cx('flex h-[34px] w-full items-center gap-3 rounded-md px-3 text-left', isSelected ? 'bg-selected text-fg' : 'text-muted')}
                onMouseEnter={() => setSelected(index)}
                onClick={() => add(item)}
              >
                <FolderGit2 size={15} className={cx('flex-none', isSelected ? 'text-accent' : 'text-subtle')} />
                <span className="max-w-[40%] flex-none truncate font-medium text-fg">{item.typed ? t('addRepo.addPath') : item.name}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm">{shorten(item.path)}</span>
                {isAdded(item.path) && <Badge tone="success">{t('addRepo.added')}</Badge>}
                {isSelected && <CornerDownLeft size={13} className="flex-none text-subtle" />}
              </button>
            )
          })}
        </div>

        {error && <div className="px-4 pb-2 text-sm break-words text-danger">{error}</div>}

        <div className="flex items-center justify-between gap-3 border-t border-line-strong px-3 py-2">
          <Button variant="ghost" disabled={!host || busy} onClick={() => host && void run(() => window.mjolnir.repos.browse(host, t('addRepo.title')))}>
            <FolderOpen size={14} />
            {t('addRepo.browse')}
          </Button>
          <span className="text-xs text-subtle">{t('addRepo.keys')}</span>
        </div>
      </div>
    </div>
  )
}
