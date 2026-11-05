import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

type ButtonVariant = 'default' | 'primary' | 'ghost'

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-hover text-fg enabled:hover:bg-selected',
  primary: 'bg-accent text-on-accent enabled:hover:brightness-110',
  ghost: 'text-muted enabled:hover:bg-selected',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'default', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('inline-flex h-control items-center gap-2 rounded-md px-3 text-sm font-medium disabled:opacity-50', VARIANTS[variant], className)}
      {...props}
    />
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  danger?: boolean
  small?: boolean
}

export function IconButton({ danger, small, className, type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'grid flex-none place-items-center rounded-sm text-muted hover:bg-hover',
        small ? 'size-5' : 'size-6',
        danger ? 'hover:text-danger' : 'hover:text-fg',
        className,
      )}
      {...props}
    />
  )
}
