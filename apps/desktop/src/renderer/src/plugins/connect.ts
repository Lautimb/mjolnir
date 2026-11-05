import { PLUGIN_PORT_MESSAGE, type PluginPortMessage, type PluginPortRole } from '../../../shared/plugins'

export function requestPort(pluginId: string, role: PluginPortRole): Promise<MessagePort> {
  const nonce = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<PluginPortMessage>) => {
      if (event.source !== window || event.data?.type !== PLUGIN_PORT_MESSAGE || event.data.nonce !== nonce) return
      window.removeEventListener('message', onMessage)
      const [port] = event.ports
      if (event.data.ok && port) resolve(port)
      else reject(new Error(`plugin ${pluginId} is not active`))
    }
    window.addEventListener('message', onMessage)
    window.mjolnir.plugins.connect(pluginId, nonce, role)
  })
}
