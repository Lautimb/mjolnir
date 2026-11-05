import { createContext, use, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import type { Mjolnir } from '../client'
import type { PluginContext } from '../protocol'

type ClassValue = string | false | null | undefined

export function cx(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ')
}

const MjolnirContext = createContext<Mjolnir | null>(null)

export function MjolnirProvider({ mjolnir, children }: { mjolnir: Mjolnir; children: ReactNode }) {
  return <MjolnirContext value={mjolnir}>{children}</MjolnirContext>
}

export function useMjolnir(): Mjolnir {
  const mjolnir = use(MjolnirContext)
  if (!mjolnir) throw new Error('useMjolnir needs a <MjolnirProvider>')
  return mjolnir
}

export function useHostContext(): PluginContext {
  const mjolnir = useMjolnir()
  return useSyncExternalStore(
    (listener) => mjolnir.onContextChange(listener),
    () => mjolnir.context,
  )
}

export type ButtonVariant = 'default' | 'primary' | 'ghost'

export function Button({ variant = 'default', className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={cx('mj-button', `mj-button-${variant}`, className)} {...props} />
}

export function IconButton({ danger, className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return <button type={type} className={cx('mj-icon-button', danger && 'mj-danger', className)} {...props} />
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('mj-control', 'mj-input', className)} {...props} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('mj-control', 'mj-textarea', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('mj-control', 'mj-select', className)} {...props} />
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <label className="mj-field">
      {label}
      {children}
    </label>
  )
}

export type Tone = 'success' | 'danger' | 'accent' | 'muted'

export function Badge({ tone, title, children }: { tone: Tone; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={cx('mj-badge', `mj-tone-${tone}`)}>
      {children}
    </span>
  )
}

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: SegmentedOption<NoInfer<T>>[]
  onChange(value: NoInfer<T>): void
  label?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="mj-segmented">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="mj-empty">
      {icon}
      {children}
    </div>
  )
}
