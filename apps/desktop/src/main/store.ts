import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Repo } from '@mjolnir/core'
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings'

interface StoreData {
  repos: Repo[]
  settings: Settings
  sessionBases: Record<string, string>
}

export class Store {
  private data: StoreData

  constructor(private readonly file: string) {
    this.data = this.load()
  }

  repos(): Repo[] {
    return this.data.repos
  }

  addRepo(repo: Repo): void {
    this.data.repos = [...this.data.repos, repo]
    this.save()
  }

  removeRepo(id: string): void {
    this.data.repos = this.data.repos.filter((repo) => repo.id !== id)
    this.save()
  }

  sessionBase(key: string): string | null {
    return this.data.sessionBases[key] ?? null
  }

  setSessionBase(key: string, base: string | null): void {
    const { [key]: _, ...rest } = this.data.sessionBases
    this.data.sessionBases = base ? { ...rest, [key]: base } : rest
    this.save()
  }

  settings(): Settings {
    return this.data.settings
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.data.settings = { ...this.data.settings, ...patch }
    this.save()
    return this.data.settings
  }

  private load(): StoreData {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<StoreData>
      return {
        repos: parsed.repos ?? [],
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
        sessionBases: parsed.sessionBases ?? {},
      }
    } catch {
      return { repos: [], settings: DEFAULT_SETTINGS, sessionBases: {} }
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const temp = `${this.file}.tmp`
    writeFileSync(temp, JSON.stringify(this.data, null, 2))
    renameSync(temp, this.file)
  }
}
