import { BellDot, Check, LoaderCircle, Sparkles, type LucideIcon } from 'lucide-react'
import type { AgentStatus } from '@mjolnir/core/browser'
import { cx } from '../ui/cx'

const ICONS: Record<AgentStatus, { Icon: LucideIcon; className: string }> = {
  working: { Icon: LoaderCircle, className: 'animate-spin text-accent' },
  waiting: { Icon: BellDot, className: 'text-accent' },
  done: { Icon: Check, className: 'text-success' },
}

export function AgentStatusIcon({ status, size, label }: { status: AgentStatus | undefined; size: number; label?: string }) {
  const { Icon, className } = status ? ICONS[status] : { Icon: Sparkles, className: 'text-accent' }
  return <Icon size={size} className={cx('flex-none', className)} aria-label={label} />
}
