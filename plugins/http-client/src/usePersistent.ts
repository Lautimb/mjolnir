import { useCallback, useEffect, useRef, useState } from 'react'
import type { Json } from '@mjolnir/plugin-sdk'
import { useMjolnir } from '@mjolnir/plugin-sdk/react'

const SAVE_DELAY_MS = 300

type Update<T> = (next: T | ((current: T) => T)) => void

export function usePersistent<T>(key: string, initial: T): [value: T, update: Update<T>, loaded: boolean] {
  const { storage, ui } = useMjolnir()
  const [value, setValue] = useState(initial)
  const [loaded, setLoaded] = useState(false)
  const latest = useRef(initial)
  const touched = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    void storage
      .get(key)
      .catch(() => null)
      .then((stored) => {
        if (cancelled) return
        if (stored !== null && !touched.current) {
          latest.current = stored as T
          setValue(stored as T)
        }
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [storage, key])

  const update = useCallback<Update<T>>(
    (next) => {
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(latest.current) : next
      latest.current = resolved
      touched.current = true
      setValue(resolved)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        storage.set(key, resolved as Json).catch((error: unknown) => ui.notify(String(error), 'error'))
      }, SAVE_DELAY_MS)
    },
    [storage, ui, key],
  )

  return [value, update, loaded]
}
