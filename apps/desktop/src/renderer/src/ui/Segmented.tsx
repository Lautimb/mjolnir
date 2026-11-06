import type { ReactNode } from 'react'
import { cx } from './cx'

export interface SegmentedOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

const SIZES = { md: 'h-[26px]', sm: 'h-6', xs: 'h-[22px]' }

interface Props<T extends string> {
  value: T
  options: SegmentedOption<NoInfer<T>>[]
  onChange(value: NoInfer<T>): void
  size?: keyof typeof SIZES
  label?: string
  className?: string
}

export function Segmented<T extends string>({ value, options, onChange, size = 'md', label, className }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex flex-none rounded-md border border-line-strong bg-surface p-0.5', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.title}
          aria-label={option.title}
          className={cx(
            'flex items-center gap-1.5 rounded-sm px-3 text-sm text-muted hover:text-fg aria-checked:bg-selected aria-checked:text-fg',
            SIZES[size],
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
