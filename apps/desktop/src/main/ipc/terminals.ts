import { spawnCommand } from '@mjolnir/core'
import { AppError } from '../../shared/errors'
import type { Services } from '.'
import { handle, listen } from './handle'
import { id, spawnRequest, terminalInput, terminalSize } from '../schemas'

export function registerTerminalsIpc({ environment, terminals }: Services): void {
  handle('profiles:list', [], () => environment.profiles)

  handle('pty:spawn', [spawnRequest], ({ id: ptyId, profileId, cols, rows, cwd, initialInput }) => {
    const profile = environment.profiles.find((candidate) => candidate.id === profileId)
    if (!profile) throw new AppError('unknownProfile', { id: profileId })
    terminals.spawn(ptyId, spawnCommand(profile, cwd), cols, rows, initialInput)
  })
  listen('pty:write', [id, terminalInput], (ptyId, data) => terminals.write(ptyId, data))
  listen('pty:resize', [id, terminalSize, terminalSize], (ptyId, cols, rows) => terminals.resize(ptyId, cols, rows))
  listen('pty:kill', [id], (ptyId) => terminals.kill(ptyId))
}
