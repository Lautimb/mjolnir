import { X } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { IconButton } from '../ui/Button'

export function Toast({ message, onClose }: { message: string; onClose(): void }) {
  const { t } = useI18n()
  return (
    <div
      role="alert"
      className="fixed right-4 bottom-[calc(var(--spacing-statusbar)+--spacing(4))] z-50 flex max-w-[420px] items-start gap-3 rounded-md border-l-3 border-danger bg-raised py-3 pr-3 pl-4 text-sm break-words shadow-popover"
    >
      <span>{message}</span>
      <IconButton aria-label={t('common.close')} onClick={onClose}>
        <X size={14} />
      </IconButton>
    </div>
  )
}
