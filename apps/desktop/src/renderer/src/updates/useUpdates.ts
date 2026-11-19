import { useEffect, useRef, useState } from 'react'
import type { UpdateState } from '../../../shared/updates'
import { useI18n } from '../i18n/I18nProvider'

const NOTIFICATION_TAG = 'mjolnir:update'

export function pendingUpdate(state: UpdateState | null): string | null {
  const status = state?.status
  return status?.kind === 'ready' || status?.kind === 'available' ? status.version : null
}

export function useUpdates(): UpdateState | null {
  const { t } = useI18n()
  const [state, setState] = useState<UpdateState | null>(null)
  const notified = useRef<string | null>(null)

  useEffect(() => {
    void window.mjolnir.updates.state().then(setState)
    return window.mjolnir.updates.onChange(setState)
  }, [])

  const status = state?.status
  useEffect(() => {
    if (status?.kind !== 'ready' && status?.kind !== 'available') return
    if (notified.current === status.version) return
    notified.current = status.version
    const body = status.kind === 'ready' ? t('updates.notify.ready') : t('updates.notify.available')
    window.mjolnir.window.notify(NOTIFICATION_TAG, t('updates.notify.title', { version: status.version }), body)
  }, [status, t])

  return state
}
