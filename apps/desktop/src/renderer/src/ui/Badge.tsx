import type { ReactNode } from 'react'
import { cx } from './cx'

export type Tone = 'success' | 'danger' | 'accent' | 'muted' | 'merged' | 'wsl' | 'windows' | 'posix'

const TONES: Record<Tone, string> = {
  success: 'text-success bg-success/14',
  danger: 'text-danger bg-danger/14',
  accent: 'text-accent bg-accent/12',
  muted: 'text-muted bg-muted/14',
  merged: 'text-merged bg-merged/14',
  wsl: 'text-wsl bg-wsl/14',
  windows: 'text-windows bg-windows/14',
  posix: 'text-posix bg-posix/14',
}

export function Badge({ tone, title, className, children }: { tone: Tone; title?: string; className?: string; children: ReactNode }) {
  return (
    <span title={title} className={cx('flex-none rounded-sm px-1.5 text-xs leading-[18px]', TONES[tone], className)}>
      {children}
    </span>
  )
}
