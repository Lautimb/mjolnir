import type { Services } from '.'
import { handle } from './handle'
import { comment, createPullRequest, fileChange, id, path, pullNumber, pullRequestQuery, ref } from '../schemas'

export function registerPullsIpc({ pulls }: Services): void {
  handle('pulls:context', [id], (repoId) => pulls.context(repoId))
  handle('pulls:list', [id, pullRequestQuery], (repoId, query) => pulls.list(repoId, query))
  handle('pulls:get', [id, pullNumber], (repoId, number) => pulls.get(repoId, number))
  handle('pulls:forBranch', [id, ref], (repoId, branch) => pulls.forBranch(repoId, branch))
  handle('pulls:comments', [id, pullNumber], (repoId, number) => pulls.comments(repoId, number))
  handle('pulls:comment', [id, pullNumber, comment], (repoId, number, body) => pulls.comment(repoId, number, body))
  handle('pulls:create', [id, path, createPullRequest], (repoId, worktree, input) => pulls.create(repoId, worktree, input))
  handle('pulls:diff', [id, pullNumber, ref], (repoId, number, base) => pulls.diff(repoId, number, base))
  handle('pulls:diffFile', [id, ref, ref, fileChange], (repoId, from, to, change) => pulls.diffFile(repoId, from, to, change))
}
