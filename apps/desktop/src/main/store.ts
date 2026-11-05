import type { Repo } from '@mjolnir/core'
import { DEFAULT_SETTINGS, type Settings } from '../shared/settings'
import { readJson, writeJsonAtomic } from './json-file'
import { settings as settingsSchema } from './schemas'

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
    const parsed = (readJson(this.file) ?? {}) as Partial<StoreData>
    return {
      repos: parsed.repos ?? [],
      settings: { ...DEFAULT_SETTINGS, ...settingsSchema.partial().catch({}).parse(parsed.settings) },
      sessionBases: parsed.sessionBases ?? {},
    }
  }

  private save(): void {
    writeJsonAtomic(this.file, this.data)
  }
}
