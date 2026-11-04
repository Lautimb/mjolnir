import { ipcMain } from 'electron'
import type { CreatePullRequestInput, FileChange, PullRequestFilter } from '@mjolnir/core'
import type { Pulls } from '../pulls'

export function registerPullsIpc(pulls: Pulls): void {
  ipcMain.handle('pulls:context', (_event, repoId: string) => pulls.context(repoId))
  ipcMain.handle('pulls:list', (_event, repoId: string, filter: PullRequestFilter) => pulls.list(repoId, filter))
  ipcMain.handle('pulls:get', (_event, repoId: string, number: number) => pulls.get(repoId, number))
  ipcMain.handle('pulls:forBranch', (_event, repoId: string, branch: string) => pulls.forBranch(repoId, branch))
  ipcMain.handle('pulls:comments', (_event, repoId: string, number: number) => pulls.comments(repoId, number))
  ipcMain.handle('pulls:comment', (_event, repoId: string, number: number, body: string) => pulls.comment(repoId, number, body))
  ipcMain.handle('pulls:create', (_event, repoId: string, worktreePath: string, input: CreatePullRequestInput) =>
    pulls.create(repoId, worktreePath, input),
  )
  ipcMain.handle('pulls:diff', (_event, repoId: string, number: number, base: string) => pulls.diff(repoId, number, base))
  ipcMain.handle('pulls:diffFile', (_event, repoId: string, from: string, to: string, change: FileChange) =>
    pulls.diffFile(repoId, from, to, change),
  )
}
