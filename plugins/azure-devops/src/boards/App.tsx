import { useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { HostError, type ProviderCredential } from '@mjolnir/plugin-sdk'
import { Button, EmptyState, IconButton, Select, TextInput, useHostContext, useMjolnir } from '@mjolnir/plugin-sdk/react'
import { BoardView } from './Board'
import { createBoardsClient, type BoardsClient } from './client'
import { describeError } from './errors'
import { useT } from './i18n'
import { defaultIteration, type Named, type Scope } from './model'
import { useAsync } from './useAsync'
import { usePersistent } from './usePersistent'

const PROVIDER = 'azure-devops.azure-devops'
const HOST = 'dev.azure.com'

type IterationChoice = 'current' | 'all' | (string & {})

interface Selection {
  org: string | null
  project: string | null
  team: string | null
  board: string | null
  iteration: IterationChoice
  mine: boolean
}

const EMPTY: Selection = { org: null, project: null, team: null, board: null, iteration: 'current', mine: false }

const pickName = (list: Named[] | null, stored: string | null, fallback?: (list: Named[]) => Named | undefined) =>
  list?.find((entry) => entry.name === stored)?.name ?? (list && (fallback?.(list) ?? list[0])?.name) ?? null

export function App() {
  const t = useT()
  const mjolnir = useMjolnir()
  const credential = useAsync<ProviderCredential | null>(() => mjolnir.accounts.credential(PROVIDER, HOST), [mjolnir])

  if (credential.loading) return <EmptyState>{t('loading')}</EmptyState>
  if (credential.error instanceof HostError && credential.error.code === 'unknownMethod') return <EmptyState>{t('outdated')}</EmptyState>
  if (credential.error) return <Failure message={describeError(t, credential.error)} onRetry={credential.reload} />
  if (!credential.data) {
    return (
      <EmptyState>
        <p>{t('noAccount')}</p>
        <Button onClick={credential.reload}>{t('retry')}</Button>
      </EmptyState>
    )
  }
  return <Boards credential={credential.data} />
}

function Failure({ message, onRetry }: { message: string; onRetry(): void }) {
  const t = useT()
  return (
    <EmptyState>
      <p>{message}</p>
      <Button onClick={onRetry}>{t('retry')}</Button>
    </EmptyState>
  )
}

function Boards({ credential }: { credential: ProviderCredential }) {
  const t = useT()
  const mjolnir = useMjolnir()
  const { session } = useHostContext()
  const client = useMemo(() => createBoardsClient((request) => mjolnir.http.request(request), credential), [mjolnir, credential])
  const [selection, setSelection] = usePersistent<Selection>('selection', EMPTY)
  const [search, setSearch] = useState('')
  const choose = (patch: Partial<Selection>) => setSelection((current) => ({ ...current, ...patch }))

  const orgs = useAsync(() => client.organizations(), [client])
  const org = selection.org ?? (orgs.data?.length === 1 ? orgs.data[0]! : null)
  const projects = useAsync(org ? () => client.projects(org) : null, [client, org])
  const project = pickName(projects.data, selection.project)
  const teams = useAsync(org && project ? () => client.teams(org, project) : null, [client, org, project])
  const team = pickName(teams.data, selection.team, (list) => list.find((entry) => entry.name === `${project} Team`))
  const scope = useMemo<Scope | null>(() => (org && project && team ? { org, project, team } : null), [org, project, team])

  const boards = useAsync(scope ? () => client.boards(scope) : null, [client, scope])
  const board = pickName(boards.data, selection.board, (list) => list.at(-1))
  const boardId = boards.data?.find((entry) => entry.name === board)?.id ?? null
  const iterations = useAsync(scope ? () => client.iterations(scope) : null, [client, scope])
  const current = iterations.data ? defaultIteration(iterations.data) : null
  const iteration =
    selection.iteration === 'all' ? null : selection.iteration === 'current' ? current : (iterations.data?.find((entry) => entry.id === selection.iteration) ?? current)

  const manualOrg = !!orgs.error || orgs.data?.length === 0
  const loadingScope = orgs.loading || projects.loading || teams.loading || boards.loading || iterations.loading

  return (
    <div className="layout">
      <header className="toolbar">
        {manualOrg ? (
          <TextInput
            aria-label={t('organization')}
            title={t('noOrganizations')}
            placeholder={t('organizationPlaceholder')}
            defaultValue={selection.org ?? ''}
            onBlur={(event) => choose({ org: event.currentTarget.value.trim() || null, project: null, team: null, board: null })}
          />
        ) : (
          <Picker label={t('organization')} value={org} options={(orgs.data ?? []).map((name) => ({ id: name, name }))} onChange={(value) => choose({ org: value, project: null, team: null, board: null })} />
        )}
        <Picker label={t('project')} value={project} options={projects.data} onChange={(value) => choose({ project: value, team: null, board: null })} />
        <Picker label={t('team')} value={team} options={teams.data} onChange={(value) => choose({ team: value, board: null })} />
        <Picker label={t('board')} value={board} options={boards.data} onChange={(value) => choose({ board: value })} />
        <Select aria-label={t('iteration')} title={t('iteration')} value={selection.iteration} onChange={(event) => choose({ iteration: event.currentTarget.value })}>
          <option value="current">{current ? t('currentIteration', { name: current.name }) : t('noCurrentIteration')}</option>
          <option value="all">{t('allIterations')}</option>
          {(iterations.data ?? []).map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </Select>
        <label className="toggle">
          <input type="checkbox" checked={selection.mine} onChange={(event) => choose({ mine: event.currentTarget.checked })} />
          {t('mine')}
        </label>
        <TextInput className="search" type="search" aria-label={t('search')} placeholder={t('search')} value={search} onChange={(event) => setSearch(event.currentTarget.value)} />
        <IconButton title={t('refresh')} aria-label={t('refresh')} onClick={() => [orgs, projects, teams, boards, iterations].forEach((entry) => entry.reload())}>
          <RefreshCw size={14} />
        </IconButton>
      </header>
      <ScopeContent
        client={client}
        scope={scope}
        boardId={boardId}
        iterationPath={iteration?.path ?? null}
        iterationLoaded={!!iterations.data || !!iterations.error}
        loading={loadingScope}
        error={orgs.error && !manualOrg ? orgs.error : (projects.error ?? teams.error ?? boards.error ?? iterations.error)}
        noBoards={boards.data?.length === 0}
        mine={selection.mine}
        search={search}
        session={session}
      />
    </div>
  )
}

function ScopeContent({
  client,
  scope,
  boardId,
  iterationPath,
  iterationLoaded,
  loading,
  error,
  noBoards,
  mine,
  search,
  session,
}: {
  client: BoardsClient
  scope: Scope | null
  boardId: string | null
  iterationPath: string | null
  iterationLoaded: boolean
  loading: boolean
  error: unknown
  noBoards: boolean
  mine: boolean
  search: string
  session: ReturnType<typeof useHostContext>['session']
}) {
  const t = useT()
  if (error) return <EmptyState>{describeError(t, error)}</EmptyState>
  if (!scope) return <EmptyState>{loading ? t('loading') : t('chooseScope')}</EmptyState>
  if (noBoards) return <EmptyState>{t('noBoards')}</EmptyState>
  if (!boardId || !iterationLoaded) return <EmptyState>{t('loading')}</EmptyState>
  return <BoardView client={client} scope={scope} boardId={boardId} iterationPath={iterationPath} mine={mine} search={search} session={session} />
}

function Picker({ label, value, options, onChange }: { label: string; value: string | null; options: Named[] | null; onChange(value: string): void }) {
  const t = useT()
  return (
    <Select aria-label={label} title={label} value={value ?? ''} disabled={!options?.length} onChange={(event) => onChange(event.currentTarget.value)}>
      {!value && <option value="">{options ? t('pick') : label}</option>}
      {(options ?? []).map((option) => (
        <option key={option.id} value={option.name}>
          {option.name}
        </option>
      ))}
    </Select>
  )
}
