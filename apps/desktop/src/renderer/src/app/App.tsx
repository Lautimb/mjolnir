import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { sameHost, type Repo, type TerminalProfile, type Worktree } from '@mjolnir/core/browser'
import { readTheme, type NotifyKind, type PluginContext, type WorkspaceSession } from '@mjolnir/plugin-sdk'
import { appErrorCode } from '../../../shared/errors'
import type { Settings } from '../../../shared/settings'
import { useChangedFiles } from '../diff/useChangedFiles'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { pluginText, pluginUrl, pluginViews, touch, type PluginViewKey } from '../plugins/model'
import { PluginBackgrounds } from '../plugins/PluginBackgrounds'
import { PluginFrame } from '../plugins/PluginFrame'
import { PluginsView } from '../plugins/PluginsView'
import { usePlugins } from '../plugins/usePlugins'
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
import { Rail, type RailPluginView, type View } from './Rail'
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
  const { t, locale } = useI18n()
  const workspace = useWorkspace()
  const { repos, worktrees } = workspace
  const sessions = useSessions(repos, worktrees)
  const terminals = useTerminalTabs()
  const [view, setView] = useState<View>('sessions')
  const [profiles, setProfiles] = useState<TerminalProfile[]>([])
  const [activeKey, setActiveKey] = useState(SCRATCH_KEY)
  const [addingRepo, setAddingRepo] = useState(false)
  const { notice, show: setNotice, dismiss: dismissNotice } = useNotice()
  const { plugins } = usePlugins()
  const [mountedViews, setMountedViews] = useState<PluginViewKey[]>([])

  useEffect(() => {
    void window.mjolnir.profiles.list().then(setProfiles)
  }, [])

  const views = useMemo(() => pluginViews(plugins), [plugins])
  const railViews = useMemo<RailPluginView[]>(
    () =>
      views.map(({ key, plugin, view: entry }) => ({
        key,
        title: pluginText(plugin, entry.title, locale),
        iconUrl: entry.icon ? pluginUrl(plugin, entry.icon) : null,
      })),
    [views, locale],
  )
  const pluginContext = useMemo<Omit<PluginContext, 'session'>>(() => ({ locale, theme: readTheme(getComputedStyle(document.documentElement)) }), [locale])
  const notifyFromPlugin = useCallback((message: string, kind: NotifyKind) => setNotice(message, kind === 'error' ? 'danger' : 'info'), [setNotice])

  useEffect(() => {
    const available = new Set(views.map((entry) => entry.key))
    setMountedViews((keys) => keys.filter((key) => available.has(key)))
    setView((current) => (current.startsWith('plugin:') && !available.has(current as PluginViewKey) ? 'sessions' : current))
  }, [views])

  const changeView = (next: View) => {
    if (next.startsWith('plugin:')) setMountedViews((keys) => touch(keys, next as PluginViewKey))
    setView(next)
  }

  const session = sessions.get(activeKey) ?? sessions.get(SCRATCH_KEY)!
  const changes = useChangedFiles(session)
  const { repo: sessionRepo, worktree: sessionWorktree } = session
  const pluginSession = useMemo<WorkspaceSession | null>(
    () =>
      sessionRepo && sessionWorktree
        ? { repoId: sessionRepo.id, worktree: sessionWorktree.path, repoName: sessionRepo.name, branch: sessionWorktree.branch }
        : null,
    [sessionRepo, sessionWorktree],
  )
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
      <Rail view={view} changes={changes} pluginViews={railViews} onChange={changeView} />
      {view === 'settings' && <SettingsView settings={settings} onChange={updateSettings} />}
      {view === 'plugins' && <PluginsView plugins={plugins} />}
      <Sidebar
        hidden={view === 'settings' || view === 'plugins'}
        repos={repos}
        worktrees={worktrees}
        errors={workspace.errors}
        tabs={terminals.tabs}
        activeKey={session.key}
        onSelect={(key) => {
          setActiveKey(key)
          setView((current) => (current === 'settings' || current === 'plugins' ? 'sessions' : current))
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
      {views
        .filter((entry) => mountedViews.includes(entry.key))
        .map((entry) => (
          <PluginFrame
            key={`${entry.key}@${entry.plugin.revision}`}
            entry={entry}
            title={pluginText(entry.plugin, entry.view.title, locale)}
            active={view === entry.key}
            context={pluginContext}
            session={pluginSession}
            onNotify={notifyFromPlugin}
          />
        ))}
      <PluginBackgrounds plugins={plugins} context={pluginContext} session={pluginSession} onNotify={notifyFromPlugin} />
      <StatusBar session={session} changes={changes} onOpenDiff={() => changeView('diff')} />
      {addingRepo && <AddRepoDialog existing={repos} onAdd={addRepo} onClose={() => setAddingRepo(false)} />}
      {notice && <Toast notice={notice} onClose={dismissNotice} />}
    </div>
  )
}
