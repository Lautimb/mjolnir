import { useEffect, useRef, useState } from 'react'
import type { PluginInfo } from '../../../shared/api'
import { pluginUrl } from './model'
import { usePluginChannel, type ChannelOptions } from './usePluginChannel'

type Shared = Omit<ChannelOptions, 'frame' | 'plugin' | 'role'>

function BackgroundFrame({ plugin, entry, ...channel }: Shared & { plugin: PluginInfo; entry: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const connect = usePluginChannel({ ...channel, frame, plugin, role: 'background' })
  return <iframe ref={frame} hidden title={plugin.id} src={pluginUrl(plugin, entry)} sandbox="allow-scripts allow-same-origin" onLoad={() => void connect()} />
}

export function PluginBackgrounds({ plugins, ...channel }: Shared & { plugins: PluginInfo[] }) {
  const [running, setRunning] = useState<string[]>([])

  useEffect(
    () =>
      window.mjolnir.plugins.onBackground((pluginId, start) =>
        setRunning((current) => (start ? [...current.filter((id) => id !== pluginId), pluginId] : current.filter((id) => id !== pluginId))),
      ),
    [],
  )

  return running.map((pluginId) => {
    const plugin = plugins.find((candidate) => candidate.id === pluginId && candidate.active)
    const entry = plugin?.manifest?.background
    return plugin && entry ? <BackgroundFrame key={`${pluginId}@${plugin.revision}`} plugin={plugin} entry={entry} {...channel} /> : null
  })
}
