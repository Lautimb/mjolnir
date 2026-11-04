import { execFile, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { buildHostCommand, type Host } from './hosts'
import type { Exec } from './git'
import { parseWslDistroList, type DetectContext } from './profiles'

export function createNodeDetectContext(): DetectContext {
  return {
    platform: process.platform,
    env: process.env,
    exists: existsSync,
    listWslDistros() {
      try {
        return parseWslDistroList(execFileSync('wsl.exe', ['-l', '-q'], { timeout: 5000, windowsHide: true }))
      } catch {
        return []
      }
    },
  }
}

export type PathApi = typeof path.posix

export function hostPath(host: Host): PathApi {
  return host.kind === 'windows' ? path.win32 : path.posix
}

export function createHostExec(host: Host, platform: NodeJS.Platform = process.platform): Exec {
  return (cwd, file, args) => {
    const command = buildHostCommand(platform, host, cwd, file, args)
    return new Promise((resolve, reject) => {
      execFile(
        command.file,
        command.args,
        { cwd: command.cwd, windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
        (error, stdout, stderr) => {
          if (error) reject(new Error(stderr.trim() || error.message))
          else resolve(stdout)
        },
      )
    })
  }
}

export async function hostHome(host: Host, platform: NodeJS.Platform = process.platform): Promise<string> {
  if (platform === 'win32' && host.kind === 'wsl') {
    return createHostExec(host, platform)('/', 'sh', ['-c', 'printf %s "$HOME"'])
  }
  return homedir()
}
