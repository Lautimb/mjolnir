import type { Host } from './hosts'

export interface Repo {
  id: string
  name: string
  path: string
  host: Host
}
