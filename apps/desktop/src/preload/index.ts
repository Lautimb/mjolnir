import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { MjolnirApi } from '../shared/api'
import { PLUGIN_PORT_MESSAGE, type PluginPortMessage } from '../shared/plugins'

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
    onChange: (listener) => subscribe('settings:changed', listener),
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
  },
  repos: {
    list: () => ipcRenderer.invoke('repos:list'),
    hosts: () => ipcRenderer.invoke('repos:hosts'),
    discover: (host) => ipcRenderer.invoke('repos:discover', host),
    add: (host, path) => ipcRenderer.invoke('repos:add', host, path),
    browse: (host, title) => ipcRenderer.invoke('repos:browse', host, title),
    remove: (id) => ipcRenderer.invoke('repos:remove', id),
    branches: (id) => ipcRenderer.invoke('repos:branches', id),
    fetch: (id) => ipcRenderer.invoke('repos:fetch', id),
    takePrompts: (id) => ipcRenderer.invoke('repos:takePrompts', id),
    setTakePrompt: (id, template) => ipcRenderer.invoke('repos:setTakePrompt', id, template),
  },
  worktrees: {
    list: (repoId) => ipcRenderer.invoke('worktrees:list', repoId),
    create: (repoId, branch, base) => ipcRenderer.invoke('worktrees:create', repoId, branch, base),
    remove: (repoId, path, force) => ipcRenderer.invoke('worktrees:remove', repoId, path, force),
    changedFiles: (repoId, path) => ipcRenderer.invoke('worktrees:changedFiles', repoId, path),
  },
  accounts: {
    providers: () => ipcRenderer.invoke('accounts:providers'),
    list: () => ipcRenderer.invoke('accounts:list'),
    connectCli: (provider) => ipcRenderer.invoke('accounts:connectCli', provider),
    connectToken: (provider, token) => ipcRenderer.invoke('accounts:connectToken', provider, token),
    startDeviceFlow: (provider) => ipcRenderer.invoke('accounts:startDeviceFlow', provider),
    finishDeviceFlow: (provider) => ipcRenderer.invoke('accounts:finishDeviceFlow', provider),
    cancelDeviceFlow: (provider) => ipcRenderer.send('accounts:cancelDeviceFlow', provider),
    disconnect: (provider, host) => ipcRenderer.invoke('accounts:disconnect', provider, host),
  },
  pulls: {
    context: (repoId) => ipcRenderer.invoke('pulls:context', repoId),
    list: (repoId, query) => ipcRenderer.invoke('pulls:list', repoId, query),
    get: (repoId, number) => ipcRenderer.invoke('pulls:get', repoId, number),
    forBranch: (repoId, branch) => ipcRenderer.invoke('pulls:forBranch', repoId, branch),
    comments: (repoId, number) => ipcRenderer.invoke('pulls:comments', repoId, number),
    comment: (repoId, number, body) => ipcRenderer.invoke('pulls:comment', repoId, number, body),
    create: (repoId, worktreePath, input) => ipcRenderer.invoke('pulls:create', repoId, worktreePath, input),
    diff: (repoId, number, base) => ipcRenderer.invoke('pulls:diff', repoId, number, base),
    diffFile: (repoId, from, to, change) => ipcRenderer.invoke('pulls:diffFile', repoId, from, to, change),
  },
  diff: {
    compare: (repoId, path, mode) => ipcRenderer.invoke('diff:compare', repoId, path, mode),
    file: (repoId, path, from, change) => ipcRenderer.invoke('diff:file', repoId, path, from, change),
  },
  plugins: {
    list: () => ipcRenderer.invoke('plugins:list'),
    addFolder: (title) => ipcRenderer.invoke('plugins:addFolder', title),
    installFile: (title, filterName) => ipcRenderer.invoke('plugins:installFile', title, filterName),
    catalog: (refresh) => ipcRenderer.invoke('plugins:catalog', refresh),
    installFromCatalog: (id) => ipcRenderer.invoke('plugins:installFromCatalog', id),
    applyUpdate: (id, approved) => ipcRenderer.invoke('plugins:applyUpdate', id, approved),
    discardUpdate: (id) => ipcRenderer.invoke('plugins:discardUpdate', id),
    enable: (id, approved) => ipcRenderer.invoke('plugins:enable', id, approved),
    disable: (id) => ipcRenderer.invoke('plugins:disable', id),
    remove: (id) => ipcRenderer.invoke('plugins:remove', id),
    connect: (id, nonce, role) => ipcRenderer.send('plugins:connect', id, nonce, role),
    onChange: (listener) => subscribe('plugins:changed', listener),
    onBackground: (listener) => subscribe('plugins:background', listener),
  },
  tabs: {
    load: () => ipcRenderer.invoke('tabs:load'),
    save: (state) => ipcRenderer.send('tabs:save', state),
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

ipcRenderer.on('plugins:port', (event, { nonce, ok }: { nonce: string; ok: boolean }) => {
  window.postMessage({ type: PLUGIN_PORT_MESSAGE, nonce, ok } satisfies PluginPortMessage, '*', event.ports)
})

contextBridge.exposeInMainWorld('mjolnir', api)
