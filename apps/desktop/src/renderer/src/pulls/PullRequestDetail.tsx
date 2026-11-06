import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ExternalLink } from 'lucide-react'
import type { FileChange, PullRequestComment, PullRequestDetail as Detail } from '@mjolnir/core/browser'
import type { PullRequestDiff } from '../../../shared/api'
import { DiffBrowser } from '../diff/DiffBrowser'
import { Stats } from '../diff/Stats'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { useRelativeTime } from '../i18n/useRelativeTime'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Note } from '../ui/EmptyState'
import { TextArea } from '../ui/fields'
import { Segmented } from '../ui/Segmented'
import { DetailBadges } from './PullBadges'
import { PullNumber } from './PullRow'

interface Props {
  repoId: string
  number: number
  providerName: string
  sideBySide: boolean
  tree: boolean
  onTreeChange(tree: boolean): void
}

type Tab = 'conversation' | 'files'

const DETAIL = 'flex min-h-0 min-w-0 flex-col'

function Comment({ comment }: { comment: Pick<PullRequestComment, 'author' | 'body' | 'createdAt'> }) {
  const ago = useRelativeTime()
  return (
    <article className="overflow-hidden rounded-md border border-line-strong">
      <header className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2 text-sm text-muted">
        <Avatar url={comment.author.avatarUrl} />
        <strong className="text-fg">{comment.author.login}</strong>
        <span>{ago(new Date(comment.createdAt))}</span>
      </header>
      <div className="p-3 break-words whitespace-pre-wrap">{comment.body}</div>
    </article>
  )
}

export function PullRequestDetail({ repoId, number, providerName, sideBySide, tree, onTreeChange }: Props) {
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
    return <div className={DETAIL}>{error !== null && <Note error>{describeError(t, error)}</Note>}</div>
  }

  return (
    <div className={DETAIL}>
      <header className="flex flex-col gap-2 border-b border-line px-6 pt-4 pb-3">
        <h2 className="text-xl font-semibold">
          {detail.title} <PullNumber number={detail.number} />
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <DetailBadges pull={detail} />
          <span>{t('pulls.openedBy', { author: detail.author.login, when: ago(new Date(detail.createdAt)) })}</span>
          <code className="font-mono">
            {detail.headRef} → {detail.baseRef}
          </code>
          <Button variant="ghost" onClick={() => window.open(detail.url)}>
            <ExternalLink size={13} />
            {t('pulls.openInProvider', { provider: providerName })}
          </Button>
        </div>
        <Segmented
          className="self-start"
          value={tab}
          options={[
            { value: 'conversation', label: t('pulls.tabs.conversation') },
            {
              value: 'files',
              label: (
                <>
                  {t('pulls.tabs.files')}
                  {detail.changedFiles !== null && <span className="rounded-full bg-hover px-1.5 text-xs">{detail.changedFiles}</span>}
                  {detail.additions !== null && detail.deletions !== null && <Stats additions={detail.additions} deletions={detail.deletions} />}
                </>
              ),
            },
          ]}
          onChange={setTab}
        />
      </header>

      {error !== null && <Note error>{describeError(t, error)}</Note>}

      {tab === 'conversation' ? (
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
          <Comment comment={{ author: detail.author, body: detail.body || t('pulls.noDescription'), createdAt: detail.createdAt }} />
          {comments.map((comment) => (
            <Comment key={comment.id} comment={comment} />
          ))}
          <form className="flex flex-col items-end gap-2" onSubmit={submit}>
            <TextArea placeholder={t('pulls.commentPlaceholder')} value={draft} onChange={(event) => setDraft(event.target.value)} rows={4} />
            <Button type="submit" variant="primary" disabled={sending || !draft.trim()}>
              {sending ? t('pulls.commenting') : t('pulls.comment')}
            </Button>
          </form>
        </div>
      ) : (
        diff && <DiffBrowser files={diff.files} sideBySide={sideBySide} tree={tree} onTreeChange={onTreeChange} reloadKey={diff.to} loadFile={loadFile} />
      )}
    </div>
  )
}
