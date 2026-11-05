import { FileDiff, GitBranch, Server } from 'lucide-react'
import { hostLabel, useI18n } from '../i18n/I18nProvider'
import type { Session } from '../sessions/model'
import { HOST_TEXT } from '../ui/hosts'

interface Props {
  session: Session
  changes: number | null
  onOpenDiff(): void
}

const item = 'flex items-center gap-1.5'

export function StatusBar({ session, changes, onOpenDiff }: Props) {
  const { t } = useI18n()
  const { repo, worktree } = session

  return (
    <footer className="flex items-center gap-4 border-t border-line bg-surface px-3 text-xs text-muted [grid-area:status]">
      <span className={item}>
        <Server size={12} className={HOST_TEXT[session.host.kind]} />
        {hostLabel(t, session.host)}
      </span>
      {worktree && (
        <span className={item}>
          <GitBranch size={12} />
          {session.title}
        </span>
      )}
      {changes !== null && (
        <button className={`${item} h-full hover:text-fg`} title={t('statusBar.openDiff')} onClick={onOpenDiff}>
          <FileDiff size={12} />
          {changes === 0 ? t('statusBar.noChanges') : t('statusBar.changedFiles', { count: changes })}
        </button>
      )}
      <span className="flex-1" />
      {repo && <span className={item}>{repo.name}</span>}
    </footer>
  )
}
