import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx, eyebrow } from './cx'

export const popover = 'rounded-md bg-raised shadow-popover'

export function MenuSection({ children }: { children: ReactNode }) {
  return <div className={cx(eyebrow, 'px-2 pt-2 pb-1 text-subtle')}>{children}</div>
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-line-strong" />
}

export function MenuItem({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cx('flex h-control w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-hover', className)}
      {...props}
    />
  )
}
