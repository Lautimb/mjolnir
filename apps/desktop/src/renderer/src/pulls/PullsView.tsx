import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { GitPullRequest, GitPullRequestCreate, RefreshCw } from 'lucide-react'
import type { PullRequestFilter, PullRequestStateFilter, PullRequestSummary } from '@mjolnir/core/browser'
import type { PullRequestContext } from '../../../shared/api'
import { MAIN_AREA, MAIN_COLUMN, TOOLBAR } from '../app/layout'
import { describeError, useI18n } from '../i18n/I18nProvider'
import type { Session } from '../sessions/model'
import { Button, IconButton } from '../ui/Button'
import { EmptyState, Note } from '../ui/EmptyState'
import { MenuSection } from '../ui/Menu'
import { Segmented } from '../ui/Segmented'
import { CreatePullRequestForm } from './CreatePullRequestForm'
import { PullRequestDetail } from './PullRequestDetail'
import { PullRow, rowClass } from './PullRow'

interface Props {
  session: Session
  sideBySide: boolean
  tree: boolean
  onTreeChange(tree: boolean): void
  onOpenSettings(): void
}

type Selection = { kind: 'pull'; number: number } | { kind: 'create' } | null

const FILTERS: PullRequestFilter[] = ['mine', 'review', 'all']

const STATES: PullRequestStateFilter[] = ['open', 'closed', 'all']

function Empty({ children }: { children: ReactNode }) {
  return (
    <section className={MAIN_COLUMN}>
      <EmptyState icon={<GitPullRequest size={22} />}>{children}</EmptyState>
    </section>
  )
}

export function PullsView({ session, sideBySide, tree, onTreeChange, onOpenSettings }: Props) {
  const { t } = useI18n()
  const repoId = session.repo?.id
  const branch = session.worktree?.branch ?? null
  const [context, setContext] = useState<PullRequestContext | null>(null)
  const [filter, setFilter] = useState<PullRequestFilter>('mine')
  const [stateFilter, setStateFilter] = useState<PullRequestStateFilter>('open')
  const [pulls, setPulls] = useState<PullRequestSummary[] | null>(null)
  const [sessionPull, setSessionPull] = useState<PullRequestSummary | null | undefined>(undefined)
  const [selection, setSelection] = useState<Selection>(null)
  const [error, setError] = useState<unknown>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    setContext(null)
    setSelection(null)
    if (repoId) window.mjolnir.pulls.context(repoId).then(setContext, setError)
  }, [repoId])

  const connected = !!context?.account
  const pendingReviewsOnly = filter === 'review'
  const state = pendingReviewsOnly ? 'open' : stateFilter

  useEffect(() => {
    if (!repoId || !connected) return
    setPulls(null)
    setError(null)
    window.mjolnir.pulls.list(repoId, { filter, state }).then(setPulls, setError)
  }, [repoId, connected, filter, state, reload])

  useEffect(() => {
    setSessionPull(undefined)
    if (!repoId || !connected || !branch) return
    window.mjolnir.pulls.forBranch(repoId, branch).then(setSessionPull, () => setSessionPull(null))
  }, [repoId, connected, branch, reload])

  const onCreated = useCallback((pull: PullRequestSummary) => {
    setSelection({ kind: 'pull', number: pull.number })
    setReload((value) => value + 1)
  }, [])

  if (!session.repo || !session.worktree) {
    return (
      <Empty>
        <p>{t('pulls.pickRepo')}</p>
      </Empty>
    )
  }
  if (!context) return <Empty>{error !== null && <p>{describeError(t, error)}</p>}</Empty>
  if (!context.remote || !context.provider) {
    return (
      <Empty>
        <p>{t('errors.unsupportedRemote')}</p>
      </Empty>
    )
  }
  if (!context.account) {
    return (
      <Empty>
        <p>{t('errors.noAccount', { provider: context.provider.displayName })}</p>
        <Button variant="primary" onClick={onOpenSettings}>
          {t('pulls.connect')}
        </Button>
      </Empty>
    )
  }

  const canOpenPull = branch !== null && branch !== context.defaultBranch
  const shownAbove = canOpenPull && sessionPull ? sessionPull.number : null
  const listed = pulls?.filter((pull) => pull.number !== shownAbove)
  const isSelected = (number: number) => selection?.kind === 'pull' && selection.number === number
  const select = (number: number) => () => setSelection({ kind: 'pull', number })

  return (
    <section className={`${MAIN_AREA} grid grid-cols-[minmax(280px,360px)_minmax(0,1fr)]`}>
      <aside className="flex min-h-0 flex-col border-r border-line bg-surface">
        <header className={TOOLBAR}>
          <Segmented
            size="sm"
            value={filter}
            options={FILTERS.map((option) => ({ value: option, label: t(`pulls.filters.${option}`) }))}
            onChange={setFilter}
          />
          <span className="flex-1" />
          <IconButton title={t('common.refresh')} onClick={() => setReload((value) => value + 1)}>
            <RefreshCw size={14} />
          </IconButton>
        </header>
        {!pendingReviewsOnly && (
          <Segmented
            size="xs"
            label={t('pulls.stateLabel')}
            className="mx-3 my-2 self-start"
            value={stateFilter}
            options={STATES.map((option) => ({ value: option, label: t(`pulls.stateFilters.${option}`) }))}
            onChange={setStateFilter}
          />
        )}

        {canOpenPull && sessionPull !== undefined && (
          <div className="border-b border-line px-2 pt-1 pb-2">
            <MenuSection>{t('pulls.thisSession')}</MenuSection>
            {sessionPull ? (
              <PullRow pull={sessionPull} selected={isSelected(sessionPull.number)} onSelect={select(sessionPull.number)} />
            ) : (
              <button className={rowClass(selection?.kind === 'create', 'items-center gap-2 text-accent')} onClick={() => setSelection({ kind: 'create' })}>
                <GitPullRequestCreate size={15} />
                {t('pulls.createFor', { branch })}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {error !== null && <Note error>{describeError(t, error)}</Note>}
          {listed?.length === 0 && shownAbove === null && <Note>{t(`pulls.empty.${filter}`)}</Note>}
          {listed?.map((pull) => <PullRow key={pull.number} pull={pull} selected={isSelected(pull.number)} onSelect={select(pull.number)} />)}
        </div>
      </aside>

      {selection?.kind === 'pull' && (
        <PullRequestDetail repoId={session.repo.id} number={selection.number} providerName={context.provider.displayName} sideBySide={sideBySide} tree={tree} onTreeChange={onTreeChange} />
      )}
      {selection?.kind === 'create' && branch && (
        <CreatePullRequestForm
          repoId={session.repo.id}
          branch={branch}
          worktreePath={session.worktree.path}
          onCreated={onCreated}
          onCancel={() => setSelection(null)}
        />
      )}
      {!selection && (
        <EmptyState>
          <p>{t('pulls.pickOne')}</p>
        </EmptyState>
      )}
    </section>
  )
}
