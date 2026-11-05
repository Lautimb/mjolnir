import { describe, expect, it } from 'vitest'
import { titleFromBranch } from './CreatePullRequestForm'

describe('titleFromBranch', () => {
  it('turns conventional branch names into conventional commit titles', () => {
    expect(titleFromBranch('feat/login-ln')).toBe('feat: login ln')
    expect(titleFromBranch('fix/tabs_menu')).toBe('fix: tabs menu')
    expect(titleFromBranch('feat/ui/dark-mode')).toBe('feat: ui/dark mode')
    expect(titleFromBranch('hotfix-123')).toBe('hotfix 123')
  })
})
