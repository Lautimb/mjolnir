import { cx } from '../ui/cx'

export function Stats({ additions, deletions, className }: { additions: number; deletions: number; className?: string }) {
  return (
    <span className={cx('flex gap-1', className)}>
      <span className="text-success">+{additions}</span>
      <span className="text-danger">−{deletions}</span>
    </span>
  )
}
