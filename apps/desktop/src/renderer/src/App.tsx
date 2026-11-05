import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { AddRepoDialog } from './AddRepoDialog'
import { sameHost, type Repo, type TerminalProfile, type Worktree } from '@mjolnir/core/browser'
import { Launchpad } from './Launchpad'
import { Rail, type View } from './Rail'
import { SettingsView } from './SettingsView'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { TabBar } from './TabBar'
import { TerminalView } from './TerminalView'
import { TitleBar } from './TitleBar'
import { describeError, useI18n } from './i18n/I18nProvider'
import { useChangedFiles } from './useChangedFiles'
import type { UpdateSettings } from './useSettings'
import { useWorkspace } from './useWorkspace'
import { appErrorCode } from '../../shared/errors'
import type { Settings } from '../../shared/settings'
import {
  SCRATCH_KEY,
  sessionKey,
  worktreeSession,
  type Agent,
  type Session,
  type Tab,
} from './model'

const NOTICE_MS = 8000

const DiffView = lazy(() => import('./DiffView').then((module) => ({ default: module.DiffView })))
const PullsView = lazy(() => import('./pulls/PullsView').then((module) => ({ default: module.PullsView })))

interface Props {
  settings: Settings
  onSettingsChange: UpdateSettings
}

export function App({ settings, onSettingsChange: updateSettings }: Props) {
  const { t } = useI18n()
  const workspace = useWorkspace()
  const [view, setView] = useState<View>('sessions')
  const { repos, worktrees } = workspace
  const [profiles, setProfiles] = useState<TerminalProfile[]>([])
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeKey, setActiveKey] = useState(SCRATCH_KEY)
  const [activeTabs, setActiveTabs] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [addingRepo, setAddingRepo] = useState(false)

  useEffect(() => {
    void window.mjolnir.profiles.list().then(setProfiles)
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const sessions = useMemo(() => {
    const map = new Map<string, Session>()
    map.set(SCRATCH_KEY, { key: SCRATCH_KEY, host: window.mjolnir.appHost, title: t('sidebar.scratch') })
    for (const repo of repos) {
      for (const worktree of worktrees[repo.id] ?? []) {
        const session = worktreeSession(repo, worktree)
        map.set(session.key, session)
      }
    }
    return map
  }, [repos, worktrees, t])

  const session = sessions.get(activeKey) ?? sessions.get(SCRATCH_KEY)!
  const changes = useChangedFiles(session)
  const sessionProfiles =
    session.key === SCRATCH_KEY ? profiles : profiles.filter((profile) => sameHost(profile.host, session.host))
  const sessionTabs = tabs.filter((tab) => tab.sessionKey === session.key)
  const storedActive = activeTabs[session.key]
  const activeTabId = sessionTabs.some((tab) => tab.id === storedActive) ? storedActive : sessionTabs.at(-1)?.id

  const openTab = (tab: Omit<Tab, 'id' | 'sessionKey'>) => {
    const id = crypto.randomUUID()
    setTabs((current) => [...current, { ...tab, id, sessionKey: session.key }])
    setActiveTabs((current) => ({ ...current, [session.key]: id }))
  }

  const openShell = (profile: TerminalProfile) =>
    openTab({ profile, label: profile.label, kind: 'shell', cwd: session.cwd })

  const openAgent = (agent: Agent) => {
    const profile = sessionProfiles[0]
    if (!profile) return setNotice(t('errors.noTerminal'))
    openTab({ profile, label: agent.label, kind: 'agent', cwd: session.cwd, initialInput: `${agent.command}\r` })
  }

  const closeTabs = useCallback((predicate: (tab: Tab) => boolean) => {
    setTabs((current) => current.filter((tab) => !predicate(tab)))
  }, [])

  const markExited = useCallback((id: string, exitCode: number) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, exitCode } : tab)))
  }, [])

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
    const prefix = `${repo.id}::`
    closeTabs((tab) => tab.sessionKey.startsWith(prefix))
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
    closeTabs((tab) => tab.sessionKey === key)
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
    <div className={`app panel-${settings.panelPosition} view-${view}`}>
      <TitleBar context={session.repo ? `${session.repo.name} · ${session.title}` : session.title} />
      <Rail view={view} changes={changes} onChange={setView} />
      {view === 'settings' && <SettingsView settings={settings} onChange={updateSettings} />}
      <Sidebar
        repos={repos}
        worktrees={worktrees}
        errors={workspace.errors}
        tabs={tabs}
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
      <section className="workspace">
        <TabBar
          tabs={sessionTabs}
          activeId={activeTabId}
          profiles={sessionProfiles}
          onActivate={(id) => setActiveTabs((current) => ({ ...current, [session.key]: id }))}
          onClose={(id) => closeTabs((tab) => tab.id === id)}
          onOpenShell={openShell}
          onOpenAgent={openAgent}
        />
        <div className="terminals">
          {tabs.map((tab) => (
            <TerminalView
              key={tab.id}
              tab={tab}
              cursorStyle={settings.terminalCursorStyle}
              cursorBlink={settings.terminalCursorBlink}
              active={view === 'sessions' && tab.sessionKey === session.key && tab.id === activeTabId}
              onExit={(code) => markExited(tab.id, code)}
            />
          ))}
          {sessionTabs.length === 0 && (
            <Launchpad
              session={session}
              defaultProfile={sessionProfiles[0]}
              onOpenShell={openShell}
              onOpenAgent={openAgent}
            />
          )}
        </div>
      </section>
      {view === 'diff' && (
        <Suspense fallback={<section className="diff-view" />}>
          <DiffView
            session={session}
            sideBySide={settings.diffSideBySide}
            onSideBySideChange={(diffSideBySide) => updateSettings({ diffSideBySide })}
          />
        </Suspense>
      )}
      {view === 'pulls' && (
        <Suspense fallback={<section className="pulls-view" />}>
          <PullsView session={session} sideBySide={settings.diffSideBySide} onOpenSettings={() => setView('settings')} />
        </Suspense>
      )}
      <StatusBar session={session} changes={changes} onOpenDiff={() => setView('diff')} />
      {addingRepo && <AddRepoDialog existing={repos} onAdd={addRepo} onClose={() => setAddingRepo(false)} />}
      {notice && (
        <div className="toast" role="alert">
          <span>{notice}</span>
          <button className="icon-button" aria-label={t('common.close')} onClick={() => setNotice(null)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
