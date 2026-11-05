import { useCallback, useEffect, useState } from 'react'

export interface Async<T> {
  data: T | null
  error: unknown
  loading: boolean
  reload(): void
}

export function useAsync<T>(load: (() => Promise<T>) | null, deps: readonly unknown[]): Async<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: !!load })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!load) {
      setState({ data: null, error: null, loading: false })
      return
    }
    let cancelled = false
    setState((current) => ({ ...current, error: null, loading: true }))
    load().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error: unknown) => !cancelled && setState({ data: null, error, loading: false }),
    )
    return () => {
      cancelled = true
    }
  }, [...deps, attempt])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])
  return { ...state, reload }
}
