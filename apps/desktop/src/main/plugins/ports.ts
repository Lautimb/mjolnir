import { MessageChannelMain, type MessagePortMain } from 'electron'
import type { InvokeReply } from '@mjolnir/plugin-sdk'
import type { PluginBackgrounds } from './backgrounds'
import type { Broker } from './broker'

export type PortRole = 'view' | 'background'

const isInvokeReply = (data: unknown): data is InvokeReply => typeof (data as InvokeReply | null)?.invoke === 'number'

export class PluginPorts {
  private readonly open = new Map<string, Set<MessagePortMain>>()

  constructor(
    private readonly broker: Broker,
    private readonly backgrounds: PluginBackgrounds,
    private readonly isActive: (pluginId: string) => boolean,
  ) {}

  connect(pluginId: string, role: PortRole): MessagePortMain | null {
    if (!this.isActive(pluginId)) return null
    const { port1: host, port2: plugin } = new MessageChannelMain()
    const ports = this.open.get(pluginId) ?? new Set()
    this.open.set(pluginId, ports.add(host))
    host.on('message', async ({ data }) => {
      if (isInvokeReply(data)) {
        if (role === 'background') this.backgrounds.reply(pluginId, data)
        return
      }
      const reply = await this.broker(pluginId, data)
      if (reply) host.postMessage(reply)
    })
    host.on('close', () => {
      ports.delete(host)
      if (role === 'background') this.backgrounds.detach(pluginId, host)
    })
    host.start()
    if (role === 'background') this.backgrounds.attach(pluginId, host)
    return plugin
  }

  closeInactive(): void {
    this.backgrounds.stopInactive(this.isActive)
    for (const [pluginId, ports] of this.open) {
      if (this.isActive(pluginId)) continue
      for (const port of ports) port.close()
      this.open.delete(pluginId)
    }
  }
}
