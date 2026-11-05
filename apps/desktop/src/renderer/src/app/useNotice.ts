import { useCallback, useEffect, useState } from 'react'

const NOTICE_MS = 8000

export interface Notice {
  message: string
  tone: 'danger' | 'info'
}

export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const show = useCallback((message: string, tone: Notice['tone'] = 'danger') => setNotice({ message, tone }), [])
  const dismiss = useCallback(() => setNotice(null), [])

  return { notice, show, dismiss }
}
