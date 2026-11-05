import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { useI18n } from '../i18n/I18nProvider'
import { cx } from '../ui/cx'
import { MjolnirMark } from './MjolnirMark'

type Chrome = 'overlay' | 'mac' | 'custom'

const chrome: Chrome = window.mjolnir.platform === 'win32' ? 'overlay' : window.mjolnir.platform === 'darwin' ? 'mac' : 'custom'

const CHROME_PADDING: Record<Chrome, string> = {
  overlay: 'pl-4 pr-[140px]',
  mac: 'pl-20',
  custom: 'pl-4',
}

const control = 'grid w-[46px] place-items-center text-muted'
const regular = `${control} hover:bg-hover hover:text-fg`
const closer = `${control} hover:bg-close hover:text-white`

export function TitleBar({ context }: { context: string }) {
  const { t } = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (chrome !== 'custom') return
    void window.mjolnir.window.isMaximized().then(setMaximized)
    return window.mjolnir.window.onMaximizedChange(setMaximized)
  }, [])

  return (
    <header
      className={cx(
        'flex items-center gap-4 border-b border-line bg-surface text-sm text-muted select-none [-webkit-app-region:drag] [grid-area:title]',
        CHROME_PADDING[chrome],
      )}
    >
      <div className="flex items-center gap-2 font-semibold text-fg">
        <MjolnirMark size={16} />
        Mjolnir
      </div>
      <div className="min-w-0 flex-1 truncate text-center">{context}</div>
      {chrome === 'custom' && (
        <div className="flex self-stretch [-webkit-app-region:no-drag]">
          <button className={regular} aria-label={t('window.minimize')} onClick={() => window.mjolnir.window.minimize()}>
            <Minus size={14} />
          </button>
          <button
            className={regular}
            aria-label={maximized ? t('window.restore') : t('window.maximize')}
            onClick={() => window.mjolnir.window.toggleMaximize()}
          >
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button className={closer} aria-label={t('common.close')} onClick={() => window.mjolnir.window.close()}>
            <X size={15} />
          </button>
        </div>
      )}
    </header>
  )
}
