import { describe, expect, it } from 'vitest'
import { createHostExec } from './node'

const distro = process.env.WSL_DISTRO_NAME

describe.runIf(distro)('createHostExec through wsl.exe', () => {
  it('passes arguments verbatim, without the default shell reinterpreting them', async () => {
    const exec = createHostExec({ kind: 'wsl', distro: distro! }, 'win32')
    const args = ['--format=%(refname)', 'two words', "it's", '"quoted"', '$HOME', '*']
    expect(await exec('/', 'printf', ['%s\\n', ...args])).toBe(args.map((arg) => `${arg}\n`).join(''))
  })
})
