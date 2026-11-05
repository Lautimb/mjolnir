import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { seesWorkspace, type NewSessionRequest, type NotifyKind, type PluginContext, type PluginMessage, type ShellMessage, type WorkspaceSession } from '@mjolnir/plugin-sdk'
import type { PluginInfo } from '../../../shared/api'
import type { PluginPortRole } from '../../../shared/plugins'
import { requestPort } from './connect'
import { asNewSession, pluginOrigin } from './model'

const MAX_NOTICE = 500

function asNotice(data: unknown): Extract<PluginMessage, { type: 'mjolnir:notify' }> | null {
  const message = data as PluginMessage | null
  if (message?.type !== 'mjolnir:notify' || typeof message.message !== 'string') return null
  const kind: NotifyKind = message.kind === 'error' ? 'error' : 'info'
  return { type: message.type, message: message.message.slice(0, MAX_NOTICE), kind }
}

export interface ChannelOptions {
  frame: RefObject<HTMLIFrameElement | null>
  plugin: PluginInfo
  role: PluginPortRole
  context: Omit<PluginContext, 'session'>
  session: WorkspaceSession | null
  onNotify(message: string, kind: NotifyKind): void
  onNewSession?(request: NewSessionRequest): void
}

export function usePluginChannel({ frame, plugin, role, context: base, session, onNotify, onNewSession }: ChannelOptions): () => Promise<void> {
  const permissions = plugin.manifest?.permissions
  const visibleSession = permissions && seesWorkspace(permissions) ? session : null
  const context = useMemo<PluginContext>(() => ({ ...base, session: visibleSession }), [base, visibleSession])
  const latestContext = useRef(context)
  const connected = useRef(false)
  const origin = pluginOrigin(plugin.id)

  const post = (target: Window, message: ShellMessage, transfer: Transferable[] = []) => target.postMessage(message, origin, transfer)

  useEffect(() => {
    latestContext.current = context
    const target = frame.current?.contentWindow
    if (connected.current && target) post(target, { type: 'mjolnir:context', context })
  }, [context])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return
      const notice = asNotice(event.data)
      if (notice) return onNotify(notice.message, notice.kind)
      const request = visibleSession && role === 'view' ? asNewSession(event.data) : null
      if (request) onNewSession?.(request)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [frame, onNotify, onNewSession, visibleSession, role])

  return async () => {
    const target = frame.current?.contentWindow
    if (!target) return
    connected.current = false
    const port = await requestPort(plugin.id, role).catch(() => null)
    if (!port) return
    if (frame.current?.contentWindow !== target) return port.close()
    post(target, { type: 'mjolnir:connect', context: latestContext.current }, [port])
    connected.current = true
  }
}
