import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { ChevronDown, GitBranch, Globe, RefreshCw, Search } from 'lucide-react'
import { groupBranches, type BranchList, type BranchRef } from '@mjolnir/core/browser'
import { useI18n } from '../i18n/I18nProvider'
import { useRelativeTime } from '../i18n/useRelativeTime'
import { IconButton } from '../ui/Button'
import { cx, focusRing } from '../ui/cx'
import { Badge } from '../ui/Badge'
import { MenuSection, popover } from '../ui/Menu'
import { useDismiss } from '../ui/useDismiss'

interface Props {
  list: BranchList | null
  value: string
  refreshing: boolean
  onChange(value: string): void
  onRefresh(): void
}

const POPOVER_WIDTH = 380

function Hint({ children }: { children: string }) {
  return <div className="p-3 text-sm text-muted">{children}</div>
}
const POPOVER_HEIGHT = 400

export function BranchPicker({ list, value, refreshing, onChange, onRefresh }: Props) {
  const { t } = useI18n()
  const ago = useRelativeTime()
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

  useDismiss(open, [popoverRef, triggerRef], useCallback(() => setOpen(false), []))

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
      <button
        ref={triggerRef}
        type="button"
        className={cx(
          'flex h-control items-center justify-between gap-2 rounded-sm border border-line-strong bg-canvas px-2 text-left text-md text-fg',
          focusRing,
        )}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{value}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          ref={popoverRef}
          className={cx(popover, 'fixed z-30 flex flex-col overflow-hidden')}
          style={{ ...position, width: POPOVER_WIDTH }}
          onKeyDown={onKeyDown}
        >
          <div className="flex items-center gap-2 border-b border-line-strong py-2 pr-2 pl-3 text-subtle">
            <Search size={14} />
            <input
              className="h-[26px] min-w-0 flex-1 bg-transparent text-fg outline-none"
              autoFocus
              placeholder={t('branchPicker.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              spellCheck={false}
            />
            <IconButton title={t('branchPicker.fetch')} disabled={refreshing} onClick={onRefresh}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
            {!list && <Hint>{t('branchPicker.loading')}</Hint>}
            {list && flat.length === 0 && <Hint>{t('branchPicker.noMatch')}</Hint>}
            {groups.map((group) => (
              <div key={group.id} role="group" aria-label={t(`branchPicker.groups.${group.id}`)}>
                <MenuSection>{t(`branchPicker.groups.${group.id}`)}</MenuSection>
                {group.refs.map((ref) => {
                  index += 1
                  const current = index
                  const Icon = ref.remote ? Globe : GitBranch
                  return (
                    <button
                      key={ref.name}
                      type="button"
                      className={cx(
                        'flex h-control w-full items-center gap-2 rounded-sm px-2 text-left',
                        current === active ? 'bg-hover text-fg' : 'text-muted',
                      )}
                      onMouseEnter={() => setActive(current)}
                      onClick={() => pick(ref)}
                    >
                      <Icon size={13} className="flex-none text-subtle" />
                      <span className={cx('min-w-0 flex-1 truncate', ref.name === value ? 'text-accent' : undefined)}>{ref.name}</span>
                      {ref.name === list?.defaultBase && <Badge tone="accent">{t('branchPicker.default')}</Badge>}
                      <span className="flex-none text-xs text-subtle">{ago(ref.updatedAt * 1000)}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
          {hiddenOthers > 0 && (
            <div className="border-t border-line-strong px-3 py-2 text-xs text-subtle">
              {t('branchPicker.hiddenOthers', { count: hiddenOthers })}
            </div>
          )}
        </div>
      )}
    </>
  )
}
