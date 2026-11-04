import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ExternalLink } from 'lucide-react'
import type { FileChange, PullRequestComment, PullRequestDetail as Detail } from '@mjolnir/core/browser'
import type { PullRequestDiff } from '../../../shared/api'
import { DiffBrowser } from '../DiffBrowser'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { useRelativeTime } from '../i18n/useRelativeTime'
import { DetailBadges } from './PullBadges'

interface Props {
  repoId: string
  number: number
  providerName: string
  sideBySide: boolean
}

type Tab = 'conversation' | 'files'

function Comment({ comment }: { comment: Pick<PullRequestComment, 'author' | 'body' | 'createdAt'> }) {
  const ago = useRelativeTime()
  return (
    <article className="pull-comment">
      <header>
        {comment.author.avatarUrl && <img className="avatar" src={comment.author.avatarUrl} alt="" />}
        <strong>{comment.author.login}</strong>
        <span>{ago(new Date(comment.createdAt))}</span>
      </header>
      <div className="pull-comment-body">{comment.body}</div>
    </article>
  )
}

export function PullRequestDetail({ repoId, number, providerName, sideBySide }: Props) {
  const { t } = useI18n()
  const ago = useRelativeTime()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [comments, setComments] = useState<PullRequestComment[]>([])
  const [diff, setDiff] = useState<PullRequestDiff | null>(null)
  const [tab, setTab] = useState<Tab>('conversation')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const { pulls } = window.mjolnir

  useEffect(() => {
    setDetail(null)
    setComments([])
    setDiff(null)
    setError(null)
    Promise.all([pulls.get(repoId, number), pulls.comments(repoId, number)]).then(([nextDetail, nextComments]) => {
      setDetail(nextDetail)
      setComments(nextComments)
    }, setError)
  }, [repoId, number])

  useEffect(() => {
    if (tab !== 'files' || !detail || diff) return
    pulls.diff(repoId, number, detail.baseRef).then(setDiff, setError)
  }, [tab, detail, diff, repoId, number])

  const loadFile = useCallback(
    (change: FileChange) => pulls.diffFile(repoId, diff!.from, diff!.to, change),
    [repoId, diff],
  )

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) return
    setSending(true)
    try {
      const created = await pulls.comment(repoId, number, draft.trim())
      setComments((current) => [...current, created])
      setDraft('')
    } catch (err) {
      setError(err)
    } finally {
      setSending(false)
    }
  }

  if (!detail) {
    return <div className="pull-detail">{error !== null && <p className="diff-error">{describeError(t, error)}</p>}</div>
  }

  return (
    <div className="pull-detail">
      <header className="pull-header">
        <h2>
          {detail.title} <span className="pull-number">#{detail.number}</span>
        </h2>
        <div className="pull-meta">
          <DetailBadges pull={detail} />
          <span>{t('pulls.openedBy', { author: detail.author.login, when: ago(new Date(detail.createdAt)) })}</span>
          <code>
            {detail.headRef} → {detail.baseRef}
          </code>
          <button className="button ghost" onClick={() => window.open(detail.url)}>
            <ExternalLink size={13} />
            {t('pulls.openInProvider', { provider: providerName })}
          </button>
        </div>
        <div className="segmented pull-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'conversation'} className={tab === 'conversation' ? 'selected' : undefined} onClick={() => setTab('conversation')}>
            {t('pulls.tabs.conversation')}
          </button>
          <button role="tab" aria-selected={tab === 'files'} className={tab === 'files' ? 'selected' : undefined} onClick={() => setTab('files')}>
            {t('pulls.tabs.files')} <span className="pull-count">{detail.changedFiles}</span>
            <span className="added">+{detail.additions}</span>
            <span className="removed">−{detail.deletions}</span>
          </button>
        </div>
      </header>

      {error !== null && <p className="diff-error">{describeError(t, error)}</p>}

      {tab === 'conversation' ? (
        <div className="pull-conversation">
          <Comment comment={{ author: detail.author, body: detail.body || t('pulls.noDescription'), createdAt: detail.createdAt }} />
          {comments.map((comment) => (
            <Comment key={comment.id} comment={comment} />
          ))}
          <form className="pull-reply" onSubmit={submit}>
            <textarea placeholder={t('pulls.commentPlaceholder')} value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} />
            <button type="submit" className="button primary" disabled={sending || !draft.trim()}>
              {sending ? t('pulls.commenting') : t('pulls.comment')}
            </button>
          </form>
        </div>
      ) : (
        diff && <DiffBrowser files={diff.files} sideBySide={sideBySide} reloadKey={diff.to} loadFile={loadFile} />
      )}
    </div>
  )
}
