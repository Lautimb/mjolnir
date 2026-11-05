type NoParams = Record<never, never>

export interface AppErrorParams {
  invalidRequest: { channel: string }
  unknownRepo: { id: string }
  unknownWorktree: { path: string }
  worktreeDirty: { name: string }
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
  unknownPlugin: { id: string }
  pluginInvalid: { issue: string }
  pluginExists: { id: string; path: string }
  pluginPermissionsChanged: NoParams
  pluginIncompatible: { required: string; reason: 'app' | 'api' }
  pluginDownloadFailed: { message: string }
  pluginProviderFailed: { provider: string; message: string }
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

export function appErrorCode(error: unknown): AppErrorCode | null {
  return parseAppError(error instanceof Error ? error.message : String(error))?.code ?? null
}
