import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { GitPullRequest, GitPullRequestCreate, RefreshCw } from 'lucide-react'
import type { PullRequestFilter, PullRequestStateFilter, PullRequestSummary } from '@mjolnir/core/browser'
import type { PullRequestContext } from '../../../shared/api'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { useRelativeTime } from '../i18n/useRelativeTime'
import type { Session } from '../model'
import { CreatePullRequestForm } from './CreatePullRequestForm'
import { StateBadge } from './PullBadges'
import { PullRequestDetail } from './PullRequestDetail'

interface Props {
  session: Session
  sideBySide: boolean
  onOpenSettings(): void
}

type Selection = { kind: 'pull'; number: number } | { kind: 'create' } | null

const FILTERS: PullRequestFilter[] = ['mine', 'review', 'all']

const STATES: PullRequestStateFilter[] = ['open', 'closed', 'all']

function PullRow({ pull, selected, onSelect }: { pull: PullRequestSummary; selected: boolean; onSelect(): void }) {
  const ago = useRelativeTime()
  return (
    <button className={`pull-row${selected ? ' selected' : ''}`} onClick={onSelect}>
      <span className="pull-row-title">
        <span className="pull-number">#{pull.number}</span> {pull.title}
      </span>
      <span className="pull-row-meta">
        <StateBadge pull={pull} />
        {pull.author.avatarUrl && <img className="avatar small" src={pull.author.avatarUrl} alt="" />}
        <span>{pull.author.login}</span>
        <span className="pull-row-branch">{pull.headRef}</span>
        <span>{ago(new Date(pull.updatedAt))}</span>
      </span>
    </button>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <section className="pulls-view empty">
      <div className="diff-empty">
        <GitPullRequest size={22} />
        {children}
      </div>
    </section>
  )
}

export function PullsView({ session, sideBySide, onOpenSettings }: Props) {
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
        <button className="button primary" onClick={onOpenSettings}>
          {t('pulls.connect')}
        </button>
      </Empty>
    )
  }

  const canOpenPull = branch !== null && branch !== context.defaultBranch
  const shownAbove = canOpenPull && sessionPull ? sessionPull.number : null
  const listed = pulls?.filter((pull) => pull.number !== shownAbove)

  return (
    <section className="pulls-view">
      <aside className="pulls-list">
        <header className="diff-toolbar">
          <div className="segmented" role="radiogroup">
            {FILTERS.map((option) => (
              <button key={option} className={filter === option ? 'selected' : undefined} onClick={() => setFilter(option)}>
                {t(`pulls.filters.${option}`)}
              </button>
            ))}
          </div>
          <span className="status-spacer" />
          <button className="icon-button" title={t('common.refresh')} onClick={() => setReload((value) => value + 1)}>
            <RefreshCw size={14} />
          </button>
        </header>
        {!pendingReviewsOnly && (
          <div className="pulls-filters segmented" role="radiogroup" aria-label={t('pulls.stateLabel')}>
            {STATES.map((option) => (
              <button key={option} className={stateFilter === option ? 'selected' : undefined} onClick={() => setStateFilter(option)}>
                {t(`pulls.stateFilters.${option}`)}
              </button>
            ))}
          </div>
        )}

        {canOpenPull && sessionPull !== undefined && (
          <div className="pulls-session">
            <div className="menu-section">{t('pulls.thisSession')}</div>
            {sessionPull ? (
              <PullRow
                pull={sessionPull}
                selected={selection?.kind === 'pull' && selection.number === sessionPull.number}
                onSelect={() => setSelection({ kind: 'pull', number: sessionPull.number })}
              />
            ) : (
              <button className={`pull-row create${selection?.kind === 'create' ? ' selected' : ''}`} onClick={() => setSelection({ kind: 'create' })}>
                <GitPullRequestCreate size={15} />
                {t('pulls.createFor', { branch })}
              </button>
            )}
          </div>
        )}

        <div className="pulls-items">
          {error !== null && <p className="diff-note error">{describeError(t, error)}</p>}
          {listed?.length === 0 && shownAbove === null && <p className="diff-note">{t(`pulls.empty.${filter}`)}</p>}
          {listed?.map((pull) => (
            <PullRow
              key={pull.number}
              pull={pull}
              selected={selection?.kind === 'pull' && selection.number === pull.number}
              onSelect={() => setSelection({ kind: 'pull', number: pull.number })}
            />
          ))}
        </div>
      </aside>

      {selection?.kind === 'pull' && (
        <PullRequestDetail repoId={session.repo.id} number={selection.number} providerName={context.provider.displayName} sideBySide={sideBySide} />
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
        <div className="diff-empty">
          <p>{t('pulls.pickOne')}</p>
        </div>
      )}
    </section>
  )
}
