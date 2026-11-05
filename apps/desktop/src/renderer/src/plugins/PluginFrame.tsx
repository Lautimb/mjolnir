import { useEffect, useRef } from 'react'
import type { NotifyKind, PluginContext, PluginMessage, ShellMessage } from '@mjolnir/plugin-sdk'
import { MAIN_COLUMN } from '../app/layout'
import { requestPort } from './connect'
import { pluginOrigin, pluginUrl, type PluginView } from './model'

const MAX_NOTICE = 500

function asNotice(data: unknown): Extract<PluginMessage, { type: 'mjolnir:notify' }> | null {
  const message = data as PluginMessage | null
  if (message?.type !== 'mjolnir:notify' || typeof message.message !== 'string') return null
  const kind: NotifyKind = message.kind === 'error' ? 'error' : 'info'
  return { type: message.type, message: message.message.slice(0, MAX_NOTICE), kind }
}

interface Props {
  entry: PluginView
  title: string
  active: boolean
  context: PluginContext
  onNotify(message: string, kind: NotifyKind): void
}

export function PluginFrame({ entry, title, active, context, onNotify }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const latestContext = useRef(context)
  const connected = useRef(false)
  const origin = pluginOrigin(entry.plugin.id)

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
      if (notice) onNotify(notice.message, notice.kind)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onNotify])

  const connect = async () => {
    const target = frame.current?.contentWindow
    if (!target) return
    connected.current = false
    const port = await requestPort(entry.plugin.id).catch(() => null)
    if (!port) return
    if (frame.current?.contentWindow !== target) return port.close()
    post(target, { type: 'mjolnir:connect', context: latestContext.current }, [port])
    connected.current = true
  }

  return (
    <section hidden={!active} className={MAIN_COLUMN}>
      <iframe
        ref={frame}
        title={title}
        src={pluginUrl(entry.plugin, entry.view.entry)}
        sandbox="allow-scripts allow-same-origin allow-forms"
        onLoad={() => void connect()}
        className="min-h-0 w-full flex-1 border-0 bg-canvas"
      />
    </section>
  )
}
