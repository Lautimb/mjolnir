import { randomUUID } from 'node:crypto'
import type { Dirent, Stats } from 'node:fs'
import { lstat, mkdir, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { allowsRepoDir, allowsRepoPath, isSafeRepoPath, matchesRepoGlob, repoGlobReaches, repoPathSegments, type RepoFileEntry } from '@mjolnir/plugin-sdk'
import { HostFailure } from './failure'

export const REPO_FILE_LIMITS = { fileBytes: 5_000_000, listEntries: 5_000 }

const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'

async function stats(path: string): Promise<Stats | null> {
  try {
    return await lstat(path)
  } catch (error) {
    if (missing(error)) return null
    throw error
  }
}

async function resolve(root: string, path: string, globs: readonly string[] | undefined): Promise<{ target: string; existing: Stats | null }> {
  if (!allowsRepoPath(globs, path)) throw new HostFailure('permissionDenied', path)
  const segments = repoPathSegments(path)
  let current = root
  for (const [index, segment] of segments.entries()) {
    current = join(current, segment)
    const info = await stats(current)
    if (!info) return { target: join(root, ...segments), existing: null }
    if (info.isSymbolicLink()) throw new HostFailure('permissionDenied', `${path}: symbolic links are not followed`)
    if (index < segments.length - 1 && !info.isDirectory()) throw new HostFailure('invalidRequest', `${path}: not a folder`)
    if (index === segments.length - 1) return { target: current, existing: info }
  }
  throw new HostFailure('invalidRequest', path)
}

export async function readRepoFile(root: string, path: string, globs: readonly string[] | undefined): Promise<string | null> {
  const { target, existing } = await resolve(root, path, globs)
  if (!existing) return null
  if (!existing.isFile()) throw new HostFailure('invalidRequest', `${path}: not a file`)
  if (existing.size > REPO_FILE_LIMITS.fileBytes) throw new HostFailure('quotaExceeded', `${path}: larger than ${REPO_FILE_LIMITS.fileBytes} bytes`)
  return readFile(target, 'utf8')
}

export async function writeRepoFile(root: string, path: string, content: string, globs: readonly string[] | undefined): Promise<void> {
  if (Buffer.byteLength(content) > REPO_FILE_LIMITS.fileBytes) throw new HostFailure('quotaExceeded', `${path}: larger than ${REPO_FILE_LIMITS.fileBytes} bytes`)
  const { target, existing } = await resolve(root, path, globs)
  if (existing && !existing.isFile()) throw new HostFailure('invalidRequest', `${path}: not a file`)
  const segments = repoPathSegments(path)
  const folder = join(root, ...segments.slice(0, -1))
  await mkdir(folder, { recursive: true })
  const temporary = join(folder, `.${segments.at(-1)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, content, { flag: 'wx' })
    await rename(temporary, target)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function deleteRepoFile(root: string, path: string, globs: readonly string[] | undefined): Promise<void> {
  const { target, existing } = await resolve(root, path, globs)
  if (!existing) return
  if (!existing.isFile()) throw new HostFailure('invalidRequest', `${path}: not a file`)
  await unlink(target)
}

export async function listRepoFiles(root: string, dir: string, globs: readonly string[] | undefined): Promise<RepoFileEntry[]> {
  if (!allowsRepoDir(globs, dir)) throw new HostFailure('permissionDenied', dir || '.')
  const granted = globs ?? []
  const start = repoPathSegments(dir)
  for (let depth = 1; depth <= start.length; depth++) {
    const info = await stats(join(root, ...start.slice(0, depth)))
    if (!info) return []
    if (info.isSymbolicLink() || !info.isDirectory()) throw new HostFailure('invalidRequest', `${dir}: not a folder`)
  }

  const entries: RepoFileEntry[] = []
  const walk = async (relative: string[]): Promise<void> => {
    let children: Dirent[]
    try {
      children = await readdir(join(root, ...relative), { withFileTypes: true })
    } catch (error) {
      if (missing(error)) return
      throw error
    }
    const folders: string[][] = []
    const files: string[] = []
    for (const child of children) {
      const path = [...relative, child.name].join('/')
      if (!isSafeRepoPath(path)) continue
      if (child.isDirectory() && granted.some((glob) => repoGlobReaches(glob, path))) folders.push([...relative, child.name])
      else if (child.isFile() && granted.some((glob) => matchesRepoGlob(glob, path))) files.push(path)
    }
    if (entries.length + files.length > REPO_FILE_LIMITS.listEntries) {
      throw new HostFailure('quotaExceeded', `more than ${REPO_FILE_LIMITS.listEntries} files`)
    }
    const infos = await Promise.all(files.map((path) => stats(join(root, ...path.split('/')))))
    files.forEach((path, index) => {
      const info = infos[index]
      if (info?.isFile()) entries.push({ path, size: info.size, modifiedMs: Math.round(info.mtimeMs) })
    })
    await Promise.all(folders.map(walk))
  }
  await walk(start)
  return entries.sort((a, b) => a.path.localeCompare(b.path))
}
