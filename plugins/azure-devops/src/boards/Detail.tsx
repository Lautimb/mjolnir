import { useMemo, useState } from 'react'
import { ExternalLink, GitBranch, GitPullRequest, X } from 'lucide-react'
import type { WorkspaceSession } from '@mjolnir/plugin-sdk'
import { Badge, Button, Field, IconButton, TextInput, useMjolnir } from '@mjolnir/plugin-sdk/react'
import { workItemUrl, type BoardsClient } from './client'
import { describeError } from './errors'
import { useT } from './i18n'
import { branchName, columnOf, isMine, startColumn, type Board, type Me, type Scope, type WorkItem } from './model'

interface Props {
  client: BoardsClient
  scope: Scope
  board: Board
  item: WorkItem
  me: Me | null
  session: WorkspaceSession | null
  onChange(item: WorkItem): void
  onStale(): void
  onClose(): void
}

function htmlToText(html: string): string {
  if (!html) return ''
  const spaced = html.replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '$&\n')
  return (new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

export function Detail({ client, scope, board, item, me, session, onChange, onStale, onClose }: Props) {
  const t = useT()
  const { ui } = useMjolnir()
  const [branch, setBranch] = useState(() => branchName(item))
  const [busy, setBusy] = useState(false)
  const description = useMemo(() => htmlToText(item.description), [item.description])
  const mine = isMine(item, me)
  const name = branch.trim()
  const canSession = !!session && !!name

  const take = async () => {
    setBusy(true)
    try {
      let current = item
      if (!mine && me) {
        current = await client.take(scope, board, current, me)
        onChange(current)
      }
      const start = startColumn(current, board)
      if (start) {
        try {
          current = await client.move(scope, board, current, start)
          onChange(current)
        } catch (error) {
          ui.notify(describeError(t, error), 'error')
        }
      }
      if (session && name) ui.newSession({ repoId: session.repoId, branch: name })
    } catch (error) {
      ui.notify(describeError(t, error), 'error')
      onStale()
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="detail" aria-label={`#${item.id}`}>
      <header className="detail-header">
        <Badge tone="muted">{item.type}</Badge>
        <span className="card-id">#{item.id}</span>
        <span className="detail-spacer" />
        <IconButton title={t('openItem', { id: item.id })} aria-label={t('openItem', { id: item.id })} onClick={() => void ui.openExternal(workItemUrl(scope.org, scope.project, item.id))}>
          <ExternalLink size={14} />
        </IconButton>
        <IconButton title={t('close')} aria-label={t('close')} onClick={onClose}>
          <X size={14} />
        </IconButton>
      </header>
      <div className="detail-body">
        <h2 className="detail-title">{item.title}</h2>
        <dl className="detail-facts">
          <dt>{t('state')}</dt>
          <dd>
            {item.state}
            {columnOf(item, board) && ` · ${columnOf(item, board)!.name}`}
          </dd>
          <dt>{t('assignee')}</dt>
          <dd>{item.assignedTo?.name ?? t('unassigned')}</dd>
        </dl>
        {item.tags.length > 0 && (
          <div className="card-footer">
            {item.tags.map((tag) => (
              <Badge key={tag} tone="accent">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        {item.links.length > 0 && (
          <ul className="detail-links">
            {item.links.map((link) => (
              <li key={`${link.kind}/${link.repoId}/${link.name}`} className="link">
                {link.kind === 'branch' ? <GitBranch size={12} /> : <GitPullRequest size={12} />}
                {link.kind === 'branch' ? link.name : `PR ${link.name}`}
              </li>
            ))}
          </ul>
        )}
        <p className="detail-description">{description || t('noDescription')}</p>
      </div>
      <footer className="detail-footer">
        <Field label={t('branch')}>
          <TextInput value={branch} spellCheck={false} onChange={(event) => setBranch(event.currentTarget.value)} />
        </Field>
        <p className="note">{session ? t('takeHint', { repo: session.repoName }) : t('takeNoSession')}</p>
        <Button variant="primary" disabled={busy || (mine ? !canSession : !me)} onClick={() => void take()}>
          {busy ? t('taking') : mine ? t('createSession') : t('take')}
        </Button>
      </footer>
    </aside>
  )
}
