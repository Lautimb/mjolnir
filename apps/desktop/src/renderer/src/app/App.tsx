import { lazy, Suspense, useEffect, useState } from 'react'
import { sameHost, type Repo, type TerminalProfile, type Worktree } from '@mjolnir/core/browser'
import { appErrorCode } from '../../../shared/errors'
import type { Settings } from '../../../shared/settings'
import { useChangedFiles } from '../diff/useChangedFiles'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { AddRepoDialog } from '../sessions/AddRepoDialog'
import { repoKeyPrefix, SCRATCH_KEY, sessionKey } from '../sessions/model'
import { Sidebar } from '../sessions/Sidebar'
import { useSessions } from '../sessions/useSessions'
import { useWorkspace } from '../sessions/useWorkspace'
import { SettingsView } from '../settings/SettingsView'
import type { UpdateSettings } from '../settings/useSettings'
import { Launchpad } from '../terminals/Launchpad'
import type { Agent } from '../terminals/model'
import { TabBar } from '../terminals/TabBar'
import { TerminalView } from '../terminals/TerminalView'
import { useTerminalTabs } from '../terminals/useTerminalTabs'
import { cx } from '../ui/cx'
import { LAYOUTS, MAIN_COLUMN } from './layout'
import { Rail, type View } from './Rail'
import { StatusBar } from './StatusBar'
import { TitleBar } from './TitleBar'
import { Toast } from './Toast'
import { useNotice } from './useNotice'

const DiffView = lazy(() => import('../diff/DiffView').then((module) => ({ default: module.DiffView })))
const PullsView = lazy(() => import('../pulls/PullsView').then((module) => ({ default: module.PullsView })))


interface Props {
  settings: Settings
  onSettingsChange: UpdateSettings
}

export function App({ settings, onSettingsChange: updateSettings }: Props) {
  const { t } = useI18n()
  const workspace = useWorkspace()
  const { repos, worktrees } = workspace
  const sessions = useSessions(repos, worktrees)
  const terminals = useTerminalTabs()
  const [view, setView] = useState<View>('sessions')
  const [profiles, setProfiles] = useState<TerminalProfile[]>([])
  const [activeKey, setActiveKey] = useState(SCRATCH_KEY)
  const [addingRepo, setAddingRepo] = useState(false)
  const [notice, setNotice] = useNotice()

  useEffect(() => {
    void window.mjolnir.profiles.list().then(setProfiles)
  }, [])

  const session = sessions.get(activeKey) ?? sessions.get(SCRATCH_KEY)!
  const changes = useChangedFiles(session)
  const sessionProfiles = session.key === SCRATCH_KEY ? profiles : profiles.filter((profile) => sameHost(profile.host, session.host))
  const { tabs: sessionTabs, activeId: activeTabId } = terminals.forSession(session.key)

  const openShell = (profile: TerminalProfile) =>
    terminals.open(session.key, { profile, label: profile.label, kind: 'shell', cwd: session.cwd })

  const openAgent = (agent: Agent) => {
    const profile = sessionProfiles[0]
    if (!profile) return setNotice(t('errors.noTerminal'))
    terminals.open(session.key, { profile, label: agent.label, kind: 'agent', cwd: session.cwd, initialInput: `${agent.command}\r` })
  }

  const addRepo = async (request: () => Promise<Repo | null>) => {
    const repo = await workspace.addRepo(request)
    if (!repo) return false
    const main = (await window.mjolnir.worktrees.list(repo.id)).find((wt) => wt.main)
    if (main) setActiveKey(sessionKey(repo, main))
    setView('sessions')
    setAddingRepo(false)
    return true
  }

  const removeRepo = async (repo: Repo) => {
    if (!confirm(t('sessions.confirmRemoveRepo', { name: repo.name }))) return
    const prefix = repoKeyPrefix(repo)
    terminals.close((tab) => tab.sessionKey.startsWith(prefix))
    if (activeKey.startsWith(prefix)) setActiveKey(SCRATCH_KEY)
    await workspace.removeRepo(repo.id)
  }

  const createSession = async (repo: Repo, branch: string, base: string) => {
    const worktree = await workspace.createWorktree(repo.id, branch, base)
    setActiveKey(sessionKey(repo, worktree))
  }

  const removeSession = async (repo: Repo, worktree: Worktree) => {
    const name = worktree.branch ?? worktree.path
    if (!confirm(t('sessions.confirmRemove', { name }))) return
    const key = sessionKey(repo, worktree)
    terminals.close((tab) => tab.sessionKey === key)
    if (activeKey === key) {
      const main = worktrees[repo.id]?.find((wt) => wt.main)
      setActiveKey(main ? sessionKey(repo, main) : SCRATCH_KEY)
    }
    try {
      await workspace.removeWorktree(repo.id, worktree.path, false)
    } catch (error) {
      if (appErrorCode(error) !== 'worktreeDirty') return setNotice(describeError(t, error))
      if (!confirm(t('sessions.confirmForceRemove', { name }))) return
      await workspace.removeWorktree(repo.id, worktree.path, true).catch((err: unknown) => setNotice(describeError(t, err)))
    }
  }

  return (
    <div
      data-panel={settings.panelPosition}
      className={cx('grid h-full grid-rows-[var(--spacing-titlebar)_minmax(0,1fr)_var(--spacing-statusbar)]', LAYOUTS[settings.panelPosition])}
    >
      <TitleBar context={session.repo ? `${session.repo.name} · ${session.title}` : session.title} />
      <Rail view={view} changes={changes} onChange={setView} />
      {view === 'settings' && <SettingsView settings={settings} onChange={updateSettings} />}
      <Sidebar
        hidden={view === 'settings'}
        repos={repos}
        worktrees={worktrees}
        errors={workspace.errors}
        tabs={terminals.tabs}
        activeKey={session.key}
        onSelect={(key) => {
          setActiveKey(key)
          setView((current) => (current === 'settings' ? 'sessions' : current))
        }}
        onAddRepo={() => setAddingRepo(true)}
        onRemoveRepo={removeRepo}
        onCreateSession={createSession}
        onRemoveSession={removeSession}
      />
      <section hidden={view !== 'sessions'} className={MAIN_COLUMN}>
        <TabBar
          tabs={sessionTabs}
          activeId={activeTabId}
          profiles={sessionProfiles}
          onActivate={(id) => terminals.activate(session.key, id)}
          onClose={(id) => terminals.close((tab) => tab.id === id)}
          onOpenShell={openShell}
          onOpenAgent={openAgent}
        />
        <div className="relative min-h-0 flex-1">
          {terminals.tabs.map((tab) => (
            <TerminalView
              key={tab.id}
              tab={tab}
              cursorStyle={settings.terminalCursorStyle}
              cursorBlink={settings.terminalCursorBlink}
              active={view === 'sessions' && tab.sessionKey === session.key && tab.id === activeTabId}
              onExit={(code) => terminals.markExited(tab.id, code)}
            />
          ))}
          {sessionTabs.length === 0 && (
            <Launchpad session={session} defaultProfile={sessionProfiles[0]} onOpenShell={openShell} onOpenAgent={openAgent} />
          )}
        </div>
      </section>
      {view === 'diff' && (
        <Suspense fallback={<section className={MAIN_COLUMN} />}>
          <DiffView
            session={session}
            sideBySide={settings.diffSideBySide}
            onSideBySideChange={(diffSideBySide) => updateSettings({ diffSideBySide })}
          />
        </Suspense>
      )}
      {view === 'pulls' && (
        <Suspense fallback={<section className={MAIN_COLUMN} />}>
          <PullsView session={session} sideBySide={settings.diffSideBySide} onOpenSettings={() => setView('settings')} />
        </Suspense>
      )}
      <StatusBar session={session} changes={changes} onOpenDiff={() => setView('diff')} />
      {addingRepo && <AddRepoDialog existing={repos} onAdd={addRepo} onClose={() => setAddingRepo(false)} />}
      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </div>
  )
}
