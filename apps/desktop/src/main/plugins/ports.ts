import { MessageChannelMain, type MessagePortMain } from 'electron'
import type { Broker } from './broker'

export class PluginPorts {
  private readonly open = new Map<string, Set<MessagePortMain>>()

  constructor(
    private readonly broker: Broker,
    private readonly isActive: (pluginId: string) => boolean,
  ) {}

  connect(pluginId: string): MessagePortMain | null {
    if (!this.isActive(pluginId)) return null
    const { port1: host, port2: plugin } = new MessageChannelMain()
    const ports = this.open.get(pluginId) ?? new Set()
    this.open.set(pluginId, ports.add(host))
    host.on('message', async ({ data }) => {
      const reply = await this.broker(pluginId, data)
      if (reply) host.postMessage(reply)
    })
    host.on('close', () => ports.delete(host))
    host.start()
    return plugin
  }

  closeInactive(): void {
    for (const [pluginId, ports] of this.open) {
      if (this.isActive(pluginId)) continue
      for (const port of ports) port.close()
      this.open.delete(pluginId)
    }
  }
}
