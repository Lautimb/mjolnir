import { useEffect, type RefObject } from 'react'

export function useDismiss(open: boolean, inside: RefObject<HTMLElement | null>[], onDismiss: () => void): void {
  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!inside.some((ref) => ref.current?.contains(target))) onDismiss()
    }
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onDismiss()
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onDismiss])
}
