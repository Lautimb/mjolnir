import { Download, RefreshCw } from 'lucide-react'
import type { UpdateState } from '../../../shared/updates'
import { useI18n } from '../i18n/I18nProvider'

export function UpdateButton({ state }: { state: UpdateState | null }) {
  const { t } = useI18n()
  const status = state?.status
  if (status?.kind !== 'ready' && status?.kind !== 'available') return null
  const ready = status.kind === 'ready'
  return (
    <button
      type="button"
      className="flex h-6 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-on-accent [-webkit-app-region:no-drag] hover:brightness-110"
      title={t('updates.version', { version: status.version })}
      onClick={() => window.mjolnir.updates.apply()}
    >
      {ready ? <RefreshCw size={12} /> : <Download size={12} />}
      {ready ? t('updates.restart') : t('updates.download')}
    </button>
  )
}
