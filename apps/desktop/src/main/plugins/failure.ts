import type { HostErrorCode, HostErrorPayload } from '@mjolnir/plugin-sdk'

export class HostFailure extends Error {
  constructor(
    readonly code: HostErrorCode,
    message: string,
  ) {
    super(message)
  }

  toPayload(): HostErrorPayload {
    return { code: this.code, message: this.message }
  }
}
