import { useState } from 'react'
import { ChevronRight, FolderPlus, GitBranch, Plus, SquareTerminal, Trash2, X, Zap } from 'lucide-react'
import { hostLabel, type Host, type Repo, type Worktree } from '@mjolnir/core/browser'
import { NewSessionForm } from './NewSessionForm'
import { SCRATCH_KEY, sessionKey, type Tab } from './model'

const HOST_SHORT: Record<Host['kind'], string> = { wsl: 'WSL', windows: 'Win', posix: 'Local' }

interface Props {
  repos: Repo[]
  worktrees: Record<string, Worktree[]>
  errors: Record<string, string>
  tabs: Tab[]
  activeKey: string
  onSelect(key: string): void
  onAddRepo(): void
  onRemoveRepo(repo: Repo): void
  onCreateSession(repo: Repo, branch: string, base: string): Promise<void>
  onRemoveSession(repo: Repo, worktree: Worktree): void
}

export function Sidebar(props: Props) {
  const { repos, worktrees, errors, tabs, activeKey, onSelect, onAddRepo } = props
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [creatingIn, setCreatingIn] = useState<string | null>(null)

  const indicators = (key: string) => {
    const live = tabs.filter((tab) => tab.sessionKey === key && tab.exitCode === undefined)
    return { terminals: live.length, agent: live.some((tab) => tab.kind === 'agent') }
  }

  const scratch = indicators(SCRATCH_KEY)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        Sesiones
        <button className="icon-button" title="Agregar repositorio" onClick={onAddRepo}>
          <FolderPlus size={15} />
        </button>
      </div>
      <div className="sidebar-body">
        <div
          className={`row${activeKey === SCRATCH_KEY ? ' selected' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(SCRATCH_KEY)}
        >
          <SquareTerminal size={15} />
          <span className="row-label">Terminales libres</span>
          {scratch.terminals > 0 && <span className="terminal-count">{scratch.terminals}</span>}
        </div>

        {repos.length === 0 && (
          <p className="sidebar-empty">Agregá un repositorio para crear sesiones con worktrees.</p>
        )}

        {repos.map((repo) => {
          const open = !collapsed[repo.id]
          const list = worktrees[repo.id] ?? []
          const main = list.find((wt) => wt.main)
          return (
            <section key={repo.id} className="repo">
              <div
                className="row repo-row"
                role="button"
                tabIndex={0}
                onClick={() => setCollapsed((c) => ({ ...c, [repo.id]: open }))}
                title={repo.path}
              >
                <ChevronRight size={14} className={`chevron${open ? ' open' : ''}`} />
                <span className="row-label">{repo.name}</span>
                <span className={`host-badge host-${repo.host.kind}`} title={hostLabel(repo.host)}>
                  {HOST_SHORT[repo.host.kind]}
                </span>
                <span className="row-actions">
                  <button
                    className="icon-button"
                    title="Nueva sesión"
                    onClick={(event) => {
                      event.stopPropagation()
                      setCollapsed((c) => ({ ...c, [repo.id]: false }))
                      setCreatingIn(repo.id)
                    }}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    className="icon-button danger"
                    title="Quitar repositorio de Mjolnir"
                    onClick={(event) => {
                      event.stopPropagation()
                      props.onRemoveRepo(repo)
                    }}
                  >
                    <X size={14} />
                  </button>
                </span>
              </div>

              {errors[repo.id] && <p className="repo-error">{errors[repo.id]}</p>}

              {open &&
                list.map((worktree) => {
                  const key = sessionKey(repo, worktree)
                  const state = indicators(key)
                  return (
                    <div
                      key={key}
                      className={`row session-row${activeKey === key ? ' selected' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelect(key)}
                      title={worktree.path}
                    >
                      <GitBranch size={14} className="branch-icon" />
                      <span className="row-label">{worktree.branch ?? worktree.head.slice(0, 7)}</span>
                      <span className="session-indicators">
                        {state.agent && <Zap size={13} className="agent-indicator" aria-label="Agente activo" />}
                        {state.terminals > 0 && <span className="terminal-count">{state.terminals}</span>}
                      </span>
                      {!worktree.main && (
                        <span className="row-actions">
                          <button
                            className="icon-button danger"
                            title="Eliminar sesión y su worktree"
                            onClick={(event) => {
                              event.stopPropagation()
                              props.onRemoveSession(repo, worktree)
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </span>
                      )}
                    </div>
                  )
                })}

              {open && creatingIn === repo.id && (
                <NewSessionForm
                  repo={repo}
                  fallbackBase={main?.branch ?? 'main'}
                  onCancel={() => setCreatingIn(null)}
                  onCreate={async (branch, base) => {
                    await props.onCreateSession(repo, branch, base)
                    setCreatingIn(null)
                  }}
                />
              )}

              {open && creatingIn !== repo.id && (
                <button className="row add-session" onClick={() => setCreatingIn(repo.id)}>
                  <Plus size={14} />
                  <span className="row-label">Nueva sesión</span>
                </button>
              )}
            </section>
          )
        })}
      </div>
    </aside>
  )
}
