import type { PullRequestSummary } from '@mjolnir/core/browser'
import { useRelativeTime } from '../i18n/useRelativeTime'
import { Avatar } from '../ui/Avatar'
import { cx } from '../ui/cx'
import { StateBadge } from './PullBadges'

export function rowClass(selected: boolean, className?: string): string {
  return cx('flex w-full rounded-md px-3 py-2 text-left', selected ? 'bg-selected' : 'hover:bg-hover', className)
}

export function PullNumber({ number }: { number: number }) {
  return <span className="font-normal text-subtle">#{number}</span>
}

interface Props {
  pull: PullRequestSummary
  selected: boolean
  onSelect(): void
}

export function PullRow({ pull, selected, onSelect }: Props) {
  const ago = useRelativeTime()
  return (
    <button className={rowClass(selected, cx('flex-col gap-1', selected ? 'text-fg' : 'text-muted'))} onClick={onSelect}>
      <span className="line-clamp-2 font-medium text-fg">
        <PullNumber number={pull.number} /> {pull.title}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs">
        <StateBadge pull={pull} />
        <Avatar url={pull.author.avatarUrl} small />
        <span>{pull.author.login}</span>
        <span className="max-w-40 truncate font-mono text-subtle">{pull.headRef}</span>
        <span>{ago(new Date(pull.updatedAt))}</span>
      </span>
    </button>
  )
}
