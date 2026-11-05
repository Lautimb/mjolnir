import { useCallback, useEffect, useState } from 'react'
import type { PluginInfo } from '../../../shared/api'

export function usePlugins() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])

  const refresh = useCallback(() => void window.mjolnir.plugins.list().then(setPlugins), [])

  useEffect(() => {
    refresh()
    return window.mjolnir.plugins.onChange(refresh)
  }, [refresh])

  return { plugins, refresh }
}
