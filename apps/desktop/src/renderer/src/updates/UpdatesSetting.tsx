import type { UpdateState, UpdateStatus } from '../../../shared/updates'
import { useI18n, type T } from '../i18n/I18nProvider'
import { Button } from '../ui/Button'
import { Description } from '../ui/Description'

function describe(t: T, status: UpdateStatus): string {
  switch (status.kind) {
    case 'disabled':
      return t('updates.status.disabled')
    case 'idle':
      return ''
    case 'checking':
      return t('updates.status.checking')
    case 'latest':
      return t('updates.status.latest')
    case 'available':
      return t('updates.status.available', { version: status.version })
    case 'downloading':
      return t('updates.status.downloading', { version: status.version, percent: status.percent })
    case 'ready':
      return t('updates.status.ready', { version: status.version })
    case 'error':
      return t('updates.status.error')
  }
}

export function UpdatesSetting({ state }: { state: UpdateState | null }) {
  const { t } = useI18n()
  if (!state) return null
  const { status } = state
  const actionable = status.kind === 'ready' || status.kind === 'available'
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-3">
      <div>
        <div className="font-medium">{t('updates.version', { version: state.current })}</div>
        <Description>{describe(t, status) || t('updates.description')}</Description>
      </div>
      {actionable ? (
        <Button variant="primary" onClick={() => window.mjolnir.updates.apply()}>
          {status.kind === 'ready' ? t('updates.restart') : t('updates.download')}
        </Button>
      ) : (
        <Button
          disabled={status.kind === 'disabled' || status.kind === 'checking' || status.kind === 'downloading'}
          onClick={() => window.mjolnir.updates.check()}
        >
          {t('updates.check')}
        </Button>
      )}
    </div>
  )
}
