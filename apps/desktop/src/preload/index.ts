import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MjolnirApi } from '../shared/api'

function subscribe<T extends unknown[]>(channel: string, listener: (...args: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, ...args: unknown[]) => listener(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

function argument(name: string): string {
  const prefix = `--mjolnir-${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? ''
}

const api: MjolnirApi = {
  platform: argument('platform') as NodeJS.Platform,
  appHost: JSON.parse(argument('host') || '{"kind":"posix"}'),
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizedChange: (listener) => subscribe('window:maximized', listener),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
  },
  repos: {
    list: () => ipcRenderer.invoke('repos:list'),
    hosts: () => ipcRenderer.invoke('repos:hosts'),
    discover: (host) => ipcRenderer.invoke('repos:discover', host),
    add: (host, path) => ipcRenderer.invoke('repos:add', host, path),
    browse: (host) => ipcRenderer.invoke('repos:browse', host),
    remove: (id) => ipcRenderer.invoke('repos:remove', id),
    branches: (id) => ipcRenderer.invoke('repos:branches', id),
    fetch: (id) => ipcRenderer.invoke('repos:fetch', id),
  },
  worktrees: {
    list: (repoId) => ipcRenderer.invoke('worktrees:list', repoId),
    create: (repoId, branch, base) => ipcRenderer.invoke('worktrees:create', repoId, branch, base),
    remove: (repoId, path, force) => ipcRenderer.invoke('worktrees:remove', repoId, path, force),
    changedFiles: (repoId, path) => ipcRenderer.invoke('worktrees:changedFiles', repoId, path),
  },
  diff: {
    compare: (repoId, path, mode) => ipcRenderer.invoke('diff:compare', repoId, path, mode),
    file: (repoId, path, from, change) => ipcRenderer.invoke('diff:file', repoId, path, from, change),
  },
  pty: {
    spawn: (request) => ipcRenderer.invoke('pty:spawn', request),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: (id) => ipcRenderer.send('pty:kill', id),
    onData: (listener) => subscribe('pty:data', listener),
    onExit: (listener) => subscribe('pty:exit', listener),
  },
}

contextBridge.exposeInMainWorld('mjolnir', api)
