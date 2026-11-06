import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Host } from '@mjolnir/core/browser'
import { useI18n } from '../i18n/I18nProvider'
import { cx } from '../ui/cx'
import { MenuItem, popover } from '../ui/Menu'
import { useDismiss } from '../ui/useDismiss'
import { absolutePath, wslWindowsPath } from './paths'

export interface PathRoot {
  path: string
  host: Host
}

export interface PathMenuTarget {
  x: number
  y: number
  path: string
}

interface Props {
  target: PathMenuTarget
  root?: PathRoot
  onClose(): void
}

const MENU = cx(popover, 'flex w-56 flex-col p-1 text-sm')

export function PathMenu({ target, root, onClose }: Props) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: target.x, top: target.y })
  const [submenu, setSubmenu] = useState(false)
  useDismiss(true, [ref], onClose)

  useLayoutEffect(() => {
    const menu = ref.current?.getBoundingClientRect()
    if (!menu) return
    setPosition({
      left: Math.max(0, Math.min(target.x, window.innerWidth - menu.width)),
      top: Math.max(0, Math.min(target.y, window.innerHeight - menu.height)),
    })
  }, [target])

  const copy = useCallback(
    (text: string) => {
      void navigator.clipboard.writeText(text)
      onClose()
    },
    [onClose],
  )

  const absolute = root && absolutePath(root.path, target.path, root.host)
  const distro = root?.host.kind === 'wsl' ? root.host.distro : undefined
  const opensLeft = position.left + 2 * 224 > window.innerWidth

  return (
    <div ref={ref} role="menu" className={cx(MENU, 'fixed z-40')} style={position} onContextMenu={(event) => event.preventDefault()}>
      <MenuItem onClick={() => copy(target.path)}>{t('diff.copyRelative')}</MenuItem>
      {absolute && !distro && <MenuItem onClick={() => copy(absolute)}>{t('diff.copyAbsolute')}</MenuItem>}
      {absolute && distro && (
        <div className="relative" onMouseEnter={() => setSubmenu(true)} onMouseLeave={() => setSubmenu(false)}>
          <MenuItem aria-haspopup="menu" aria-expanded={submenu} onClick={() => setSubmenu(true)}>
            <span className="flex-1">{t('diff.copyAbsolute')}</span>
            <ChevronRight size={14} className="text-subtle" />
          </MenuItem>
          {submenu && (
            <div role="menu" className={cx(MENU, 'absolute -top-1', opensLeft ? 'right-full' : 'left-full')}>
              <MenuItem title={absolute} onClick={() => copy(absolute)}>
                {t('diff.linuxPath')}
              </MenuItem>
              <MenuItem title={wslWindowsPath(absolute, distro)} onClick={() => copy(wslWindowsPath(absolute, distro))}>
                {t('diff.windowsPath')}
              </MenuItem>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
