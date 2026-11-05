import { X } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { IconButton } from '../ui/Button'
import { cx } from '../ui/cx'
import type { Notice } from './useNotice'

export function Toast({ notice, onClose }: { notice: Notice; onClose(): void }) {
  const { t } = useI18n()
  return (
    <div
      role={notice.tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'fixed right-4 bottom-[calc(var(--spacing-statusbar)+--spacing(4))] z-50 flex max-w-[420px] items-start gap-3 rounded-md border-l-3 bg-raised py-3 pr-3 pl-4 text-sm break-words shadow-popover',
        notice.tone === 'danger' ? 'border-danger' : 'border-accent',
      )}
    >
      <span>{notice.message}</span>
      <IconButton aria-label={t('common.close')} onClick={onClose}>
        <X size={14} />
      </IconButton>
    </div>
  )
}
