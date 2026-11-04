import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/settings'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  useEffect(() => {
    void window.mjolnir.settings.get().then(setSettings)
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }))
    void window.mjolnir.settings.update(patch).then(setSettings)
  }, [])

  return [settings, update] as const
}
