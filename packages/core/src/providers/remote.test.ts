import { describe, expect, it } from 'vitest'
import { parseRemoteUrl } from './remote'

describe('parseRemoteUrl', () => {
  it.each([
    ['git@github.com:Lautimb/mjolnir.git', 'github.com', 'Lautimb/mjolnir'],
    ['git@github-work:org/repo.git', 'github-work', 'org/repo'],
    ['https://github.com/Lautimb/mjolnir', 'github.com', 'Lautimb/mjolnir'],
    ['https://user:pass@GitHub.com/Lautimb/mjolnir.git/', 'github.com', 'Lautimb/mjolnir'],
    ['ssh://git@gitlab.com:2222/group/sub/project.git', 'gitlab.com', 'group/sub/project'],
    ['git@ssh.dev.azure.com:v3/org/My Project/repo', 'ssh.dev.azure.com', 'v3/org/My Project/repo'],
    ['git@ssh.dev.azure.com:v3/org/My%20Project/repo', 'ssh.dev.azure.com', 'v3/org/My Project/repo'],
    ['org@vs-ssh.visualstudio.com:v3/org/My%20Project/repo', 'vs-ssh.visualstudio.com', 'v3/org/My Project/repo'],
    ['git@github.com:org/100%.git', 'github.com', 'org/100%'],
    ['https://org@dev.azure.com/org/My%20Project/_git/repo', 'dev.azure.com', 'org/My Project/_git/repo'],
  ])('parses %s', (url, host, path) => {
    expect(parseRemoteUrl(url)).toEqual({ host, path })
  })

  it('rejects local paths and empty values', () => {
    expect(parseRemoteUrl('/home/me/repo')).toBeNull()
    expect(parseRemoteUrl('C:/code/repo')).toBeNull()
    expect(parseRemoteUrl('')).toBeNull()
  })
})
