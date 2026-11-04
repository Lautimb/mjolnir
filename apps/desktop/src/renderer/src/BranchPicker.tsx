import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ChevronDown, GitBranch, Globe, RefreshCw, Search } from 'lucide-react'
import { groupBranches, type BranchGroupId, type BranchList, type BranchRef } from '@mjolnir/core/browser'

interface Props {
  list: BranchList | null
  value: string
  refreshing: boolean
  onChange(value: string): void
  onRefresh(): void
}

const GROUP_LABELS: Record<BranchGroupId, string> = {
  principal: 'Principales',
  local: 'Locales',
  mine: 'Tuyas en el remoto',
  others: 'De otros',
}

const POPOVER_WIDTH = 380
const POPOVER_HEIGHT = 400
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

function ago(seconds: number): string {
  if (!seconds) return ''
  const diff = seconds - Date.now() / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  const [unit, size] = units.find(([, size]) => Math.abs(diff) >= size) ?? ['minute', 60]
  return relative.format(Math.round(diff / size), unit)
}

export function BranchPicker({ list, value, refreshing, onChange, onRefresh }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const { groups, hiddenOthers } = useMemo(
    () => (list ? groupBranches(list, query) : { groups: [], hiddenOthers: 0 }),
    [list, query],
  )
  const flat = groups.flatMap((group) => group.refs)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8))
    const below = window.innerHeight - rect.bottom
    setPosition(
      below >= POPOVER_HEIGHT || below >= rect.top
        ? { left, top: rect.bottom + 4, maxHeight: below - 12 }
        : { left, bottom: window.innerHeight - rect.top + 4, maxHeight: rect.top - 12 },
    )
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      const target = event.target as Node
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => setActive(0), [query])

  const pick = (ref: BranchRef | undefined) => {
    if (!ref) return
    onChange(ref.name)
    setOpen(false)
    setQuery('')
    triggerRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') setOpen(false)
    else if (event.key === 'ArrowDown') setActive((i) => Math.min(i + 1, flat.length - 1))
    else if (event.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
    else if (event.key === 'Enter') pick(flat[active])
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  let index = -1

  return (
    <>
      <button ref={triggerRef} type="button" className="branch-trigger" onClick={() => setOpen((o) => !o)}>
        <span>{value}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div ref={popoverRef} className="branch-popover" style={{ ...position, width: POPOVER_WIDTH }} onKeyDown={onKeyDown}>
          <div className="branch-search">
            <Search size={14} />
            <input
              autoFocus
              placeholder="Buscar rama…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              spellCheck={false}
            />
            <button
              type="button"
              className="icon-button"
              title="Traer ramas del remoto (git fetch)"
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw size={13} className={refreshing ? 'spin' : undefined} />
            </button>
          </div>
          <div className="branch-list">
            {!list && <div className="dialog-hint">Cargando ramas…</div>}
            {list && flat.length === 0 && <div className="dialog-hint">Ninguna rama coincide.</div>}
            {groups.map((group) => (
              <div key={group.id} role="group" aria-label={GROUP_LABELS[group.id]}>
                <div className="menu-section">{GROUP_LABELS[group.id]}</div>
                {group.refs.map((ref) => {
                  index += 1
                  const current = index
                  const Icon = ref.remote ? Globe : GitBranch
                  return (
                    <button
                      key={ref.name}
                      type="button"
                      className={`branch-item${current === active ? ' active' : ''}${ref.name === value ? ' selected' : ''}`}
                      onMouseEnter={() => setActive(current)}
                      onClick={() => pick(ref)}
                    >
                      <Icon size={13} />
                      <span className="branch-item-name">{ref.name}</span>
                      {ref.name === list?.defaultBase && <span className="branch-item-badge">default</span>}
                      <span className="branch-item-date">{ago(ref.updatedAt)}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          {hiddenOthers > 0 && (
            <div className="branch-footer">
              {hiddenOthers} {hiddenOthers === 1 ? 'rama más de otros' : 'ramas más de otros'} · escribí para buscarlas
            </div>
          )}
        </div>
      )}
    </>
  )
}
