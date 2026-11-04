import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { useI18n } from './i18n/I18nProvider'
import { MjolnirMark } from './MjolnirMark'

const chrome =
  window.mjolnir.platform === 'win32' ? 'overlay' : window.mjolnir.platform === 'darwin' ? 'mac' : 'custom'

export function TitleBar({ context }: { context: string }) {
  const { t } = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (chrome !== 'custom') return
    void window.mjolnir.window.isMaximized().then(setMaximized)
    return window.mjolnir.window.onMaximizedChange(setMaximized)
  }, [])

  return (
    <header className={`titlebar chrome-${chrome}`}>
      <div className="titlebar-brand">
        <MjolnirMark size={16} />
        Mjolnir
      </div>
      <div className="titlebar-context">{context}</div>
      {chrome === 'custom' && (
        <div className="window-controls">
          <button aria-label={t('window.minimize')} onClick={() => window.mjolnir.window.minimize()}>
            <Minus size={14} />
          </button>
          <button
            aria-label={maximized ? t('window.restore') : t('window.maximize')}
            onClick={() => window.mjolnir.window.toggleMaximize()}
          >
            {maximized ? <Copy size={12} /> : <Square size={12} />}
          </button>
          <button className="close" aria-label={t('common.close')} onClick={() => window.mjolnir.window.close()}>
            <X size={15} />
          </button>
        </div>
      )}
    </header>
  )
}
