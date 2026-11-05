import { HostError } from '@mjolnir/plugin-sdk'
import type { MessageKey, T } from './i18n'

const KNOWN: Partial<Record<HostError['code'], MessageKey>> = {
  unauthorized: 'errors.unauthorized',
  permissionDenied: 'errors.permissionDenied',
  timeout: 'errors.timeout',
  requestFailed: 'errors.requestFailed',
  invalidRequest: 'errors.invalidRequest',
}

export function describeError(t: T, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const key = error instanceof HostError ? KNOWN[error.code] : undefined
  return t(key ?? 'errors.unknown', { message })
}
