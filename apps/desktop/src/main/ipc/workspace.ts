import { dialog } from 'electron'
import { hostHome, toNativePath } from '@mjolnir/core'
import type { Services } from '.'
import { handle } from './handle'
import { compareMode, fileChange, flag, historyLimit, historyScope, host, id, label, path, promptTemplate, ref } from '../schemas'

export function registerWorkspaceIpc({ environment, window, workspace }: Services): void {
  handle('repos:list', [], () => workspace.repos())
  handle('repos:hosts', [], () => environment.repoHosts)
  handle('repos:discover', [host], (target) => workspace.discover(target))
  handle('repos:add', [host, path], (target, folder) => workspace.addRepo(target, folder))
  handle('repos:browse', [host, label], async (target, title) => {
    const parent = window.current
    if (!parent) return null
    const defaultPath = toNativePath(process.platform, target, await hostHome(target))
    const result = await dialog.showOpenDialog(parent, { title, defaultPath, properties: ['openDirectory'] })
    const [folder] = result.filePaths
    return result.canceled || !folder ? null : workspace.addNativePath(folder)
  })
  handle('repos:remove', [id], (repoId) => workspace.removeRepo(repoId))
  handle('repos:branches', [id], (repoId) => workspace.branches(repoId))
  handle('repos:fetch', [id], (repoId) => workspace.fetch(repoId))
  handle('repos:takePrompts', [id], (repoId) => workspace.takePrompts(repoId))
  handle('repos:setTakePrompt', [id, promptTemplate], (repoId, template) => workspace.setTakePrompt(repoId, template))

  handle('worktrees:list', [id], (repoId) => workspace.worktrees(repoId))
  handle('worktrees:create', [id, ref, ref], (repoId, branch, base) => workspace.createWorktree(repoId, branch, base))
  handle('worktrees:remove', [id, path, flag], (repoId, worktree, force) => workspace.removeWorktree(repoId, worktree, force))
  handle('worktrees:changedFiles', [id, path], (repoId, worktree) => workspace.changedFiles(repoId, worktree))

  handle('diff:compare', [id, path, compareMode], (repoId, worktree, mode) => workspace.compare(repoId, worktree, mode))
  handle('diff:file', [id, path, ref, fileChange], (repoId, worktree, from, change) => workspace.diffFile(repoId, worktree, from, change))
  handle('diff:history', [id, path, historyScope, historyLimit], (repoId, worktree, scope, limit) => workspace.history(repoId, worktree, scope, limit))
  handle('diff:commit', [id, path, ref], (repoId, worktree, sha) => workspace.commitDiff(repoId, worktree, sha))
  handle('diff:commitFile', [id, path, ref, ref, fileChange], (repoId, worktree, from, to, change) =>
    workspace.commitFile(repoId, worktree, from, to, change),
  )
}
