import { useEffect, useState, type ReactNode } from 'react'
import { ChevronRight, FolderPlus, GitBranch, MessageSquareText, Plus, SquareTerminal, Trash2, X, Zap } from 'lucide-react'
import type { Repo, Worktree } from '@mjolnir/core/browser'
import { describeError, hostLabel, useI18n } from '../i18n/I18nProvider'
import type { Tab } from '../terminals/model'
import { Badge } from '../ui/Badge'
import { IconButton } from '../ui/Button'
import { cx, eyebrow } from '../ui/cx'
import { SCRATCH_KEY, sessionKey, type SessionDraft } from './model'
import { NewSessionForm, type TakeLaunch } from './NewSessionForm'
import { TakePromptDialog } from './TakePromptDialog'

interface Props {
  hidden: boolean
  repos: Repo[]
  worktrees: Record<string, Worktree[]>
  errors: Record<string, unknown>
  tabs: Tab[]
  activeKey: string
  onSelect(key: string): void
  onAddRepo(): void
  onRemoveRepo(repo: Repo): void
  onCreateSession(repo: Repo, branch: string, base: string, take?: TakeLaunch): Promise<void>
  onRemoveSession(repo: Repo, worktree: Worktree): void
  draft: SessionDraft | null
  onDraftDone(): void
}

const ON_HOVER = 'hidden gap-0.5 group-hover:flex group-focus-within:flex'
const UNTIL_HOVER = 'group-hover:hidden group-focus-within:hidden'

type RowTone = 'default' | 'strong' | 'quiet'

const ROW_TONES: Record<RowTone, string> = {
  default: 'text-muted hover:text-fg',
  strong: 'font-medium text-fg',
  quiet: 'text-subtle hover:text-fg',
}

interface RowProps {
  selected?: boolean
  indent?: boolean
  tone?: RowTone
  title?: string
  onClick(): void
  children: ReactNode
}

function Row({ selected, indent, tone = 'default', title, onClick, children }: RowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      title={title}
      onClick={onClick}
      onKeyDown={(event) => event.key === 'Enter' && onClick()}
      className={cx(
        'group mx-2 flex min-h-control items-center gap-2 rounded-md pr-1 text-left',
        indent ? 'pl-[26px]' : 'pl-2',
        selected ? 'bg-selected text-fg' : cx('hover:bg-hover', ROW_TONES[tone]),
      )}
    >
      {children}
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <span className="min-w-0 flex-1 truncate">{children}</span>
}

function stop(action: () => void) {
  return (event: { stopPropagation(): void }) => {
    event.stopPropagation()
    action()
  }
}

export function Sidebar(props: Props) {
  const { hidden, repos, worktrees, errors, tabs, activeKey, onSelect, onAddRepo } = props
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [creatingIn, setCreatingIn] = useState<string | null>(null)
  const [editingPrompt, setEditingPrompt] = useState<Repo | null>(null)

  const indicators = (key: string) => {
    const live = tabs.filter((tab) => tab.sessionKey === key && tab.exitCode === undefined)
    return { terminals: live.length, agent: live.some((tab) => tab.kind === 'agent') }
  }

  const startCreating = (repoId: string) => {
    setCollapsed((current) => ({ ...current, [repoId]: false }))
    setCreatingIn(repoId)
  }

  const { draft, onDraftDone } = props
  useEffect(() => {
    if (draft) startCreating(draft.repoId)
  }, [draft])

  const stopCreating = () => {
    setCreatingIn(null)
    onDraftDone()
  }

  const scratch = indicators(SCRATCH_KEY)

  return (
    <aside
      hidden={hidden}
      className="flex min-h-0 flex-col border-r border-line bg-surface [grid-area:sidebar] panel-right:border-r-0 panel-right:border-l"
    >
      <div className={cx(eyebrow, 'flex h-tabbar flex-none items-center justify-between border-b border-line pr-2 pl-4 text-muted')}>
        {t('sidebar.title')}
        <IconButton title={t('sidebar.addRepo')} onClick={onAddRepo}>
          <FolderPlus size={15} />
        </IconButton>
      </div>
      <div className="flex-1 overflow-y-auto pt-2 pb-4">
        <Row selected={activeKey === SCRATCH_KEY} onClick={() => onSelect(SCRATCH_KEY)}>
          <SquareTerminal size={15} />
          <Label>{t('sidebar.scratch')}</Label>
          {scratch.terminals > 0 && <span className="text-xs tabular-nums">{scratch.terminals}</span>}
        </Row>

        {repos.length === 0 && <p className="m-4 text-sm text-muted">{t('sidebar.empty')}</p>}

        {repos.map((repo) => {
          const open = !collapsed[repo.id]
          const list = worktrees[repo.id] ?? []
          const main = list.find((wt) => wt.main)
          return (
            <section key={repo.id} className="mt-3">
              <Row
                title={repo.path}
                tone="strong"
                onClick={() => setCollapsed((current) => ({ ...current, [repo.id]: open }))}
              >
                <ChevronRight size={14} className={cx('flex-none text-subtle transition-transform duration-[120ms]', open && 'rotate-90')} />
                <Label>{repo.name}</Label>
                <Badge tone={repo.host.kind} title={hostLabel(t, repo.host)} className={UNTIL_HOVER}>
                  {t(`hosts.short.${repo.host.kind}`)}
                </Badge>
                <span className={ON_HOVER}>
                  <IconButton title={t('sidebar.newSession')} onClick={stop(() => startCreating(repo.id))}>
                    <Plus size={14} />
                  </IconButton>
                  <IconButton title={t('sidebar.takePrompt')} onClick={stop(() => setEditingPrompt(repo))}>
                    <MessageSquareText size={14} />
                  </IconButton>
                  <IconButton danger title={t('sidebar.removeRepo')} onClick={stop(() => props.onRemoveRepo(repo))}>
                    <X size={14} />
                  </IconButton>
                </span>
              </Row>

              {errors[repo.id] !== undefined && <p className="mt-1 mr-4 ml-[30px] text-sm text-danger">{describeError(t, errors[repo.id])}</p>}

              {open &&
                list.map((worktree) => {
                  const key = sessionKey(repo, worktree)
                  const selected = activeKey === key
                  const state = indicators(key)
                  return (
                    <Row key={key} indent selected={selected} title={worktree.path} onClick={() => onSelect(key)}>
                      <GitBranch size={14} className={cx('flex-none', selected ? 'text-accent' : 'text-subtle')} />
                      <Label>{worktree.branch ?? worktree.head.slice(0, 7)}</Label>
                      <span className={cx('flex items-center gap-1 text-subtle', UNTIL_HOVER)}>
                        {state.agent && <Zap size={13} className="text-accent" aria-label={t('sidebar.agentActive')} />}
                        {state.terminals > 0 && <span className="text-xs tabular-nums">{state.terminals}</span>}
                      </span>
                      {!worktree.main && (
                        <span className={ON_HOVER}>
                          <IconButton danger title={t('sidebar.removeSession')} onClick={stop(() => props.onRemoveSession(repo, worktree))}>
                            <Trash2 size={13} />
                          </IconButton>
                        </span>
                      )}
                    </Row>
                  )
                })}

              {open && creatingIn === repo.id && (
                <NewSessionForm
                  key={draft?.repoId === repo.id ? draft.nonce : 0}
                  repo={repo}
                  initialBranch={draft?.repoId === repo.id ? draft.branch : ''}
                  ticket={draft?.repoId === repo.id ? draft.ticket : undefined}
                  fallbackBase={main?.branch ?? 'main'}
                  onCancel={stopCreating}
                  onCreate={async (branch, base, take) => {
                    await props.onCreateSession(repo, branch, base, take)
                    stopCreating()
                  }}
                />
              )}

              {open && creatingIn !== repo.id && (
                <Row indent tone="quiet" onClick={() => startCreating(repo.id)}>
                  <Plus size={14} />
                  <Label>{t('sidebar.newSession')}</Label>
                </Row>
              )}
            </section>
          )
        })}
      </div>
      {editingPrompt && <TakePromptDialog repo={editingPrompt} onClose={() => setEditingPrompt(null)} />}
    </aside>
  )
}
