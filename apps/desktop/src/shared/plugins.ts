export const PLUGIN_PORT_MESSAGE = 'mjolnir:plugin-port'

export type PluginPortRole = 'view' | 'background'

export interface PluginPortMessage {
  type: typeof PLUGIN_PORT_MESSAGE
  nonce: string
  ok: boolean
}
