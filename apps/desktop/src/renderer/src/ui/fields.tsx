import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cx, focusRing } from './cx'

const control = cx('rounded-md border border-line-strong text-fg', focusRing)

export function Field({ label, children, as: Tag = 'label' }: { label: ReactNode; children: ReactNode; as?: 'label' | 'div' }) {
  return (
    <Tag className="flex flex-col gap-1 text-xs text-muted">
      {label}
      {children}
    </Tag>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(control, 'h-control rounded-sm bg-canvas px-2 text-md', className)} {...props} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(control, 'w-full resize-y bg-surface px-3 py-2 text-md', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(control, 'h-[30px] min-w-40 flex-none bg-surface px-2 text-sm', className)} {...props} />
}

export function FormError({ children }: { children: ReactNode }) {
  return <div className="text-sm break-words text-danger">{children}</div>
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>
}
