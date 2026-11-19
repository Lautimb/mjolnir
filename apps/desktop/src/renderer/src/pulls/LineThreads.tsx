import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import type { PullRequestThread } from '@mjolnir/core/browser'
import type { DiffAnnotations, DiffSide, DiffZone } from '../diff/MonacoDiff'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { useRelativeTime } from '../i18n/useRelativeTime'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { FormError, TextArea } from '../ui/fields'
import { Markdown } from './Markdown'

interface Draft {
  path: string
  side: DiffSide
  line: number
}

const sameDraft = (a: Draft, b: Draft) => a.path === b.path && a.side === b.side && a.line === b.line

export function useLineThreads(repoId: string, number: number, headSha: string, enabled: boolean) {
  const [threads, setThreads] = useState<PullRequestThread[]>([])
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [error, setError] = useState<unknown>(null)
  const { pulls } = window.mjolnir

  useEffect(() => {
    setThreads([])
    setDrafts([])
    setError(null)
    if (enabled) pulls.threads(repoId, number).then(setThreads, setError)
  }, [repoId, number, enabled])

  const create = useCallback(
    async (draft: Draft, body: string) => {
      const thread = await pulls.commentOnLine(repoId, number, { ...draft, commitSha: headSha, body })
      setThreads((current) => [...current, thread])
      setDrafts((current) => current.filter((entry) => !sameDraft(entry, draft)))
    },
    [repoId, number, headSha],
  )

  const reply = useCallback(
    async (threadId: string, body: string) => {
      const comment = await pulls.reply(repoId, number, threadId, body)
      setThreads((current) => current.map((thread) => (thread.id === threadId ? { ...thread, comments: [...thread.comments, comment] } : thread)))
    },
    [repoId, number],
  )

  const annotate = useCallback(
    (path: string): DiffAnnotations | undefined => {
      if (!enabled) return undefined
      const zones: DiffZone[] = [
        ...threads
          .filter((thread) => thread.path === path)
          .map((thread) => ({
            key: `thread:${thread.id}`,
            side: thread.side,
            line: thread.line,
            content: <ThreadCard thread={thread} onReply={(body) => reply(thread.id, body)} />,
          })),
        ...drafts
          .filter((draft) => draft.path === path)
          .map((draft) => ({
            key: `draft:${draft.side}:${draft.line}`,
            side: draft.side,
            line: draft.line,
            content: (
              <div className="rounded-md border border-line-strong bg-surface p-2">
                <Composer
                  onSubmit={(body) => create(draft, body)}
                  onCancel={() => setDrafts((current) => current.filter((entry) => !sameDraft(entry, draft)))}
                />
              </div>
            ),
          })),
      ]
      return {
        zones,
        onLineClick: (side, line) => {
          const draft = { path, side, line }
          setDrafts((current) => (current.some((entry) => sameDraft(entry, draft)) ? current : [...current, draft]))
        },
      }
    },
    [enabled, threads, drafts, create, reply],
  )

  const noteCount = useCallback((path: string) => threads.filter((thread) => thread.path === path).length, [threads])

  return { annotate: enabled ? annotate : undefined, noteCount, error }
}

function ThreadCard({ thread, onReply }: { thread: PullRequestThread; onReply(body: string): Promise<void> }) {
  const { t } = useI18n()
  const ago = useRelativeTime()
  const [replying, setReplying] = useState(false)
  return (
    <article className="overflow-hidden rounded-md border border-line-strong bg-surface">
      {thread.comments.map((comment) => (
        <div key={comment.id} className="border-b border-line px-3 py-2 last:border-b-0">
          <header className="mb-1 flex items-center gap-2 text-xs text-muted">
            <Avatar url={comment.author.avatarUrl} small />
            <strong className="text-fg">{comment.author.login}</strong>
            <span>{ago(new Date(comment.createdAt))}</span>
          </header>
          <Markdown>{comment.body}</Markdown>
        </div>
      ))}
      <div className="border-t border-line bg-canvas px-3 py-2">
        {replying ? (
          <Composer
            onSubmit={async (body) => {
              await onReply(body)
              setReplying(false)
            }}
            onCancel={() => setReplying(false)}
          />
        ) : (
          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setReplying(true)}>
            {t('pulls.threads.reply')}
          </Button>
        )}
      </div>
    </article>
  )
}

function Composer({ onSubmit, onCancel }: { onSubmit(body: string): Promise<void>; onCancel(): void }) {
  const { t } = useI18n()
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = async () => {
    if (!body.trim() || sending) return
    setSending(true)
    try {
      await onSubmit(body.trim())
    } catch (err) {
      setError(err)
      setSending(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) void submit()
    if (event.key === 'Escape') onCancel()
  }

  return (
    <div className="flex flex-col gap-2">
      <TextArea autoFocus rows={3} placeholder={t('pulls.commentPlaceholder')} value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={onKeyDown} />
      {error !== null && <FormError>{describeError(t, error)}</FormError>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={sending} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" disabled={sending || !body.trim()} onClick={() => void submit()}>
          {sending ? t('pulls.commenting') : t('pulls.comment')}
        </Button>
      </div>
    </div>
  )
}
