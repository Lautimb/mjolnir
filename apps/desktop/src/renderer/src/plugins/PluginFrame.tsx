import { useRef } from 'react'
import { MAIN_COLUMN } from '../app/layout'
import { pluginUrl, type PluginView } from './model'
import { usePluginChannel, type ChannelOptions } from './usePluginChannel'

interface Props extends Omit<ChannelOptions, 'frame' | 'plugin' | 'role'> {
  entry: PluginView
  title: string
  active: boolean
}

export function PluginFrame({ entry, title, active, ...channel }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const connect = usePluginChannel({ ...channel, frame, plugin: entry.plugin, role: 'view' })

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
