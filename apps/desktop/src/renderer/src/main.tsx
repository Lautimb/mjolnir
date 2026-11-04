import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './tokens.css'
import './styles.css'
import { App } from './App'
import { I18nProvider } from './i18n/I18nProvider'
import { useSettings } from './useSettings'

function Root() {
  const [settings, updateSettings] = useSettings()
  if (!settings) return null
  return (
    <I18nProvider preference={settings.language}>
      <App settings={settings} onSettingsChange={updateSettings} />
    </I18nProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Root />)
