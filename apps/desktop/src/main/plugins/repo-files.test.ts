import { mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deleteRepoFile, listRepoFiles, readRepoFile, REPO_FILE_LIMITS, writeRepoFile } from './repo-files'

const GLOBS = ['.mjolnir/http/**']

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'mjolnir-repo-files-'))
  mkdirSync(join(root, '.mjolnir', 'http', 'users'), { recursive: true })
  writeFileSync(join(root, '.mjolnir', 'http', 'users', 'list.json'), '{"method":"GET"}')
  writeFileSync(join(root, 'package.json'), '{}')
  return root
}

describe('repo files', () => {
  it('reads granted files and returns null for missing ones', async () => {
    const root = repo()
    expect(await readRepoFile(root, '.mjolnir/http/users/list.json', GLOBS)).toBe('{"method":"GET"}')
    expect(await readRepoFile(root, '.mjolnir/http/missing.json', GLOBS)).toBeNull()
  })

  it('refuses paths outside the granted globs', async () => {
    const root = repo()
    await expect(readRepoFile(root, 'package.json', GLOBS)).rejects.toMatchObject({ code: 'permissionDenied' })
    await expect(writeRepoFile(root, '../outside.json', '{}', GLOBS)).rejects.toMatchObject({ code: 'permissionDenied' })
    await expect(listRepoFiles(root, 'src', GLOBS)).rejects.toMatchObject({ code: 'permissionDenied' })
  })

  it('creates folders on write and leaves no temporary files behind', async () => {
    const root = repo()
    await writeRepoFile(root, '.mjolnir/http/orders/create.json', '{"method":"POST"}', GLOBS)
    expect(readFileSync(join(root, '.mjolnir', 'http', 'orders', 'create.json'), 'utf8')).toBe('{"method":"POST"}')
    expect(readdirSync(join(root, '.mjolnir', 'http', 'orders'))).toEqual(['create.json'])
  })

  it('does not follow symbolic links out of the repo', async () => {
    const root = repo()
    const outside = mkdtempSync(join(tmpdir(), 'mjolnir-outside-'))
    writeFileSync(join(outside, 'secret.json'), 'secret')
    symlinkSync(outside, join(root, '.mjolnir', 'http', 'linked'))
    await expect(readRepoFile(root, '.mjolnir/http/linked/secret.json', GLOBS)).rejects.toMatchObject({ code: 'permissionDenied' })
    await expect(writeRepoFile(root, '.mjolnir/http/linked/new.json', '{}', GLOBS)).rejects.toMatchObject({ code: 'permissionDenied' })
    expect((await listRepoFiles(root, '', GLOBS)).map((entry) => entry.path)).toEqual(['.mjolnir/http/users/list.json'])
  })

  it('lists only granted files, walking only the folders that can hold them', async () => {
    const root = repo()
    mkdirSync(join(root, 'node_modules', '.mjolnir', 'http'), { recursive: true })
    writeFileSync(join(root, 'node_modules', '.mjolnir', 'http', 'x.json'), '{}')
    const entries = await listRepoFiles(root, '', GLOBS)
    expect(entries).toEqual([{ path: '.mjolnir/http/users/list.json', size: 16, modifiedMs: expect.any(Number) }])
    expect(await listRepoFiles(root, '.mjolnir/http/none', GLOBS)).toEqual([])
  })

  it('deletes files and ignores ones that are already gone', async () => {
    const root = repo()
    await deleteRepoFile(root, '.mjolnir/http/users/list.json', GLOBS)
    await deleteRepoFile(root, '.mjolnir/http/users/list.json', GLOBS)
    expect(readdirSync(join(root, '.mjolnir', 'http', 'users'))).toEqual([])
    await expect(deleteRepoFile(root, '.mjolnir/http/users', ['.mjolnir/http/**'])).rejects.toMatchObject({ code: 'invalidRequest' })
  })

  it('caps the size of what a plugin can write', async () => {
    const root = repo()
    await expect(writeRepoFile(root, '.mjolnir/http/big.json', 'x'.repeat(REPO_FILE_LIMITS.fileBytes + 1), GLOBS)).rejects.toMatchObject({ code: 'quotaExceeded' })
  })
})
