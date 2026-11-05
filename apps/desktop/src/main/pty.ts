import { homedir } from 'node:os'
import { spawn, type IPty } from 'node-pty'
import type { Command } from '@mjolnir/core'

const terminalEnv = (): NodeJS.ProcessEnv => ({
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ELECTRON_'))),
  TERM_PROGRAM: 'mjolnir',
  COLORTERM: 'truecolor',
})

type Send = (channel: 'pty:data' | 'pty:exit', id: string, payload: string | number) => void

export class PtyManager {
  private readonly ptys = new Map<string, IPty>()

  constructor(private readonly send: Send) {}

  spawn(id: string, command: Command, cols: number, rows: number, initialInput?: string): void {
    this.kill(id)
    const pty = spawn(command.file, command.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: command.cwd ?? homedir(),
      env: terminalEnv(),
    })
    pty.onData((data) => this.send('pty:data', id, data))
    pty.onExit(({ exitCode }) => {
      if (this.ptys.get(id) !== pty) return
      this.ptys.delete(id)
      this.send('pty:exit', id, exitCode)
    })
    this.ptys.set(id, pty)
    if (initialInput) pty.write(initialInput)
  }

  write(id: string, data: string): void {
    this.ptys.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.ptys.get(id)?.resize(cols, rows)
  }

  kill(id: string): void {
    this.ptys.get(id)?.kill()
    this.ptys.delete(id)
  }

  killAll(): void {
    for (const id of [...this.ptys.keys()]) this.kill(id)
  }
}
