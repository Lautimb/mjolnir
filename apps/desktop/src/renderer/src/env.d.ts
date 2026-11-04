import type { MjolnirApi } from '../../shared/api'

declare global {
  interface Window {
    mjolnir: MjolnirApi
  }
}
