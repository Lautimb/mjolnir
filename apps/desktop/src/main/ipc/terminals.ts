import { AGENT_SETTINGS_ENV, AGENT_STATUS_ENV, CLAUDE_HOOK_SETTINGS, hookStatusPath, PROMPT_ENV, shellEnv, spawnCommand, supportsPrompt, type ShellVar } from '@mjolnir/core'
import { AppError } from '../../shared/errors'
import type { Services } from '.'
import { handle, listen } from './handle'
import { id, savedTabs, spawnRequest, terminalInput, terminalSize } from '../schemas'

export function registerTerminalsIpc({ environment, store, terminals, agentStatus }: Services): void {
  handle('profiles:list', [], () => environment.profiles)
  handle('tabs:load', [], () => store.terminalTabs())
  listen('tabs:save', [savedTabs], (state) => store.setTerminalTabs(state))

  handle('pty:spawn', [spawnRequest], ({ id: ptyId, profileId, cols, rows, cwd, initialInput, prompt, agentStatus: hooks }) => {
    const profile = environment.profiles.find((candidate) => candidate.id === profileId)
    if (!profile) throw new AppError('unknownProfile', { id: profileId })
    if (prompt && !supportsPrompt(profile)) throw new AppError('promptUnsupported', { profile: profile.label })
    const vars: ShellVar[] = [
      ...(prompt ? [{ name: PROMPT_ENV, value: prompt }] : []),
      ...(hooks && supportsPrompt(profile)
        ? [
            { name: AGENT_SETTINGS_ENV, value: CLAUDE_HOOK_SETTINGS },
            { name: AGENT_STATUS_ENV, value: hookStatusPath(process.platform, profile.host, agentStatus.file(ptyId)), path: true },
          ]
        : []),
    ]
    const env = vars.length > 0 ? shellEnv(profile, vars, process.env.WSLENV) : {}
    terminals.spawn(ptyId, spawnCommand(profile, cwd), cols, rows, initialInput, env)
  })
  listen('pty:write', [id, terminalInput], (ptyId, data) => terminals.write(ptyId, data))
  listen('pty:resize', [id, terminalSize, terminalSize], (ptyId, cols, rows) => terminals.resize(ptyId, cols, rows))
  listen('pty:kill', [id], (ptyId) => {
    terminals.kill(ptyId)
    agentStatus.release(ptyId)
  })
}
