import { useCallback, useEffect, useState } from 'react'
import type { Settings } from '../../../shared/settings'

export type UpdateSettings = (patch: Partial<Settings>) => void

export function useSettings(): [Settings | null, UpdateSettings] {
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    void window.mjolnir.settings.get().then(setSettings)
    return window.mjolnir.settings.onChange(setSettings)
  }, [])

  const update = useCallback<UpdateSettings>((patch) => {
    setSettings((current) => current && { ...current, ...patch })
    void window.mjolnir.settings.update(patch).then(setSettings)
  }, [])

  return [settings, update]
}
