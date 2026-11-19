export type UpdateStatus =
  | { kind: 'disabled' }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error' }

export interface UpdateState {
  current: string
  status: UpdateStatus
}
