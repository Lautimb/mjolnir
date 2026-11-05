import type { ReactNode } from 'react'

export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid flex-1 place-content-center justify-items-center gap-3 text-muted">
      {icon}
      {children}
    </div>
  )
}

export function Note({ error, children }: { error?: boolean; children: ReactNode }) {
  return <p className={error ? 'p-4 text-danger' : 'p-4 text-muted'}>{children}</p>
}
