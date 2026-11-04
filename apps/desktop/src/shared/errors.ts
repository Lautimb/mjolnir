type NoParams = Record<never, never>

export interface AppErrorParams {
  unknownRepo: { id: string }
  unknownProfile: { id: string }
  worktreeMissing: { path: string }
  unsupportedRemote: NoParams
  noAccount: { provider: string }
  providerUnauthorized: { provider: string }
  providerRequestFailed: { status: number; message: string }
  secureStorageUnavailable: NoParams
  cliNotFound: { cli: string }
  deviceFlowUnavailable: NoParams
  deviceFlowDenied: NoParams
  deviceFlowExpired: NoParams
}

export type AppErrorCode = keyof AppErrorParams

export interface AppErrorPayload<C extends AppErrorCode = AppErrorCode> {
  code: C
  params: AppErrorParams[C]
}

const PREFIX = 'mjolnir-error:'

export class AppError<C extends AppErrorCode> extends Error {
  constructor(code: C, params: AppErrorParams[C]) {
    super(`${PREFIX}${JSON.stringify({ code, params })}`)
  }
}

export function parseAppError(message: string): AppErrorPayload | null {
  const start = message.indexOf(PREFIX)
  if (start === -1) return null
  try {
    return JSON.parse(message.slice(start + PREFIX.length)) as AppErrorPayload
  } catch {
    return null
  }
}
