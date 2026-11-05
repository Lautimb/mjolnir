export const PLUGIN_PORT_MESSAGE = 'mjolnir:plugin-port'

export interface PluginPortMessage {
  type: typeof PLUGIN_PORT_MESSAGE
  nonce: string
  ok: boolean
}
