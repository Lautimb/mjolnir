import type { Services } from '.'
import { handle } from './handle'
import { comment, createPullRequest, fileChange, id, lineCommentInput, mergeInput, path, pullNumber, pullRequestQuery, ref, reviewInput, threadId } from '../schemas'

export function registerPullsIpc({ pulls }: Services): void {
  handle('pulls:context', [id], (repoId) => pulls.context(repoId))
  handle('pulls:list', [id, pullRequestQuery], (repoId, query) => pulls.list(repoId, query))
  handle('pulls:get', [id, pullNumber], (repoId, number) => pulls.get(repoId, number))
  handle('pulls:forBranch', [id, ref], (repoId, branch) => pulls.forBranch(repoId, branch))
  handle('pulls:comments', [id, pullNumber], (repoId, number) => pulls.comments(repoId, number))
  handle('pulls:comment', [id, pullNumber, comment], (repoId, number, body) => pulls.comment(repoId, number, body))
  handle('pulls:threads', [id, pullNumber], (repoId, number) => pulls.threads(repoId, number))
  handle('pulls:commentOnLine', [id, pullNumber, lineCommentInput], (repoId, number, input) => pulls.commentOnLine(repoId, number, input))
  handle('pulls:reply', [id, pullNumber, threadId, comment], (repoId, number, thread, body) => pulls.reply(repoId, number, thread, body))
  handle('pulls:merge', [id, pullNumber, mergeInput], (repoId, number, input) => pulls.merge(repoId, number, input))
  handle('pulls:review', [id, pullNumber, reviewInput], (repoId, number, input) => pulls.review(repoId, number, input))
  handle('pulls:create', [id, path, createPullRequest], (repoId, worktree, input) => pulls.create(repoId, worktree, input))
  handle('pulls:diff', [id, pullNumber, ref], (repoId, number, base) => pulls.diff(repoId, number, base))
  handle('pulls:diffFile', [id, ref, ref, fileChange], (repoId, from, to, change) => pulls.diffFile(repoId, from, to, change))
}
