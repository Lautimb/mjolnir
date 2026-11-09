import { describe, expect, it } from 'vitest'
import type { TerminalProfile } from './profiles'
import { MAX_PROMPT, PROMPT_ENV, promptArgument, promptEnv, renderPrompt, supportsPrompt } from './prompts'

const windows = (file: string): TerminalProfile => ({ id: file, label: file, host: { kind: 'windows' }, file, args: [] })
const bash: TerminalProfile = { id: 'shell', label: 'bash', host: { kind: 'posix' }, file: '/bin/bash', args: ['-l'] }
const wsl: TerminalProfile = { id: 'wsl:Ubuntu', label: 'WSL', host: { kind: 'wsl', distro: 'Ubuntu' }, file: 'C:\\Windows\\System32\\wsl.exe', args: ['-d', 'Ubuntu'], launcher: 'wsl' }
const pwsh = windows('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
const powershell = windows('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe')
const cmd = windows('C:\\Windows\\system32\\cmd.exe')

function windowsPowerShellNeedsQuotes(arg: string): boolean {
  let followingBackslash = false
  let quotes = 0
  for (const char of arg) {
    if (char === '"' && !followingBackslash) quotes++
    else if (/\s/.test(char) && quotes % 2 === 0) return true
    followingBackslash = char === '\\'
  }
  return false
}

function commandLineToArgv(line: string): string[] {
  const args: string[] = []
  let current = ''
  let quoted = false
  let started = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (char === '\\') {
      let slashes = 0
      while (line[i] === '\\') slashes++, i++
      if (line[i] === '"') {
        current += '\\'.repeat(Math.floor(slashes / 2))
        if (slashes % 2) current += '"'
        else (quoted = !quoted), (started = true)
      } else {
        current += '\\'.repeat(slashes)
        i--
      }
      started = true
    } else if (char === '"') {
      quoted = !quoted
      started = true
    } else if ((char === ' ' || char === '\t') && !quoted) {
      if (started) args.push(current)
      current = ''
      started = false
    } else {
      current += char
      started = true
    }
  }
  if (started) args.push(current)
  return args
}

function throughWindowsPowerShell(value: string): string[] {
  const arg = windowsPowerShellNeedsQuotes(value) ? `"${value}"` : value
  return commandLineToArgv(`claude --session-id x ${arg}`).slice(3)
}

describe('renderPrompt', () => {
  it('fills the known placeholders once, without expanding placeholders that come inside the values', () => {
    const prompt = renderPrompt('#{id} {title}\n{url}\n\n{description}\n{branch}', {
      id: '42',
      title: 'Login {branch}',
      url: 'https://dev.azure.com/o/p/_workitems/edit/42',
      description: 'Uses {title} and $(rm -rf ~)',
      branch: 'feat/42-login',
    })
    expect(prompt).toBe('#42 Login {branch}\nhttps://dev.azure.com/o/p/_workitems/edit/42\n\nUses {title} and $(rm -rf ~)\nfeat/42-login')
  })

  it('leaves unknown placeholders as written and drops the blank lines that empty values leave behind', () => {
    expect(renderPrompt('{id} {other}\n\n{url}\n\n\n{description}\n', { id: '7' })).toBe('7 {other}')
  })

  it('caps the prompt so it fits in a Windows environment variable', () => {
    expect(renderPrompt('{description}', { description: 'a'.repeat(MAX_PROMPT * 2) })).toHaveLength(MAX_PROMPT)
  })
})

describe('promptArgument', () => {
  it('references the variable inside double quotes on posix shells, where the value is not parsed again', () => {
    expect(promptArgument(bash)).toBe(`"$${PROMPT_ENV}"`)
    expect(promptArgument(wsl)).toBe(`"$${PROMPT_ENV}"`)
  })

  it('uses the env drive on PowerShell and does not support cmd, which expands variables before parsing', () => {
    expect(promptArgument(pwsh)).toBe(`$env:${PROMPT_ENV}`)
    expect(promptArgument(powershell)).toBe(`$env:${PROMPT_ENV}`)
    expect(promptArgument(cmd)).toBeNull()
    expect([bash, wsl, pwsh, powershell, cmd].map(supportsPrompt)).toEqual([true, true, true, true, false])
  })
})

describe('promptEnv', () => {
  const tricky = 'Arreglá "el login" de C:\\temp\\ & $(whoami)\n\n`ls` | echo %PATH% \\"ya\\" fin\\'

  it('passes the prompt untouched to posix shells and to pwsh', () => {
    expect(promptEnv(bash, tricky, undefined)[PROMPT_ENV]).toBe(tricky)
    expect(promptEnv(pwsh, tricky, undefined)[PROMPT_ENV]).toBe(tricky)
  })

  it('pre-escapes the value so Windows PowerShell 5.1 hands the native command the original prompt', () => {
    for (const prompt of [tricky, 'una sola', 'sin"espacios"', '"todo entre comillas"', 'termina en \\', 'a\\\\"b c']) {
      expect(throughWindowsPowerShell(promptEnv(powershell, prompt, undefined)[PROMPT_ENV]!)).toEqual([prompt])
    }
  })

  it('shares the variable across the WSL boundary without dropping what WSLENV already had', () => {
    expect(promptEnv(wsl, 'x', undefined).WSLENV).toBe(PROMPT_ENV)
    expect(promptEnv(wsl, 'x', `USERPROFILE/p:${PROMPT_ENV}/u`).WSLENV).toBe(`USERPROFILE/p:${PROMPT_ENV}`)
  })
})
