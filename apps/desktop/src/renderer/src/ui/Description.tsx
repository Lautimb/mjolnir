import type { ReactNode } from 'react'

export function Description({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted">{children}</div>
}
