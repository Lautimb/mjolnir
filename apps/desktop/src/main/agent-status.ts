import { mkdirSync, readdirSync, readFile, rmSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { isUuid, parseHookEvent, type AgentEvent } from '@mjolnir/core'

const SUFFIX = '.json'

export class AgentStatusFiles {
  private watcher: FSWatcher | null = null

  constructor(
    private readonly dir: string,
    private readonly onEvent: (tabId: string, event: AgentEvent) => void,
  ) {}

  start(): void {
    mkdirSync(this.dir, { recursive: true })
    for (const name of readdirSync(this.dir)) if (this.tabOf(name)) rmSync(join(this.dir, name), { force: true })
    this.watcher = watch(this.dir, (_type, name) => {
      const tabId = name && this.tabOf(name)
      if (tabId) this.read(tabId)
    })
  }

  file(tabId: string): string {
    if (!isUuid(tabId)) throw new Error(`invalid tab id: ${tabId}`)
    return join(this.dir, `${tabId}${SUFFIX}`)
  }

  release(tabId: string): void {
    if (isUuid(tabId)) rmSync(this.file(tabId), { force: true })
  }

  dispose(): void {
    this.watcher?.close()
    this.watcher = null
  }

  private tabOf(name: string): string | null {
    const tabId = name.endsWith(SUFFIX) ? name.slice(0, -SUFFIX.length) : ''
    return isUuid(tabId) ? tabId : null
  }

  private read(tabId: string): void {
    readFile(this.file(tabId), 'utf8', (error, text) => {
      const event = error ? null : parseHookEvent(text)
      if (event) this.onEvent(tabId, event)
    })
  }
}
