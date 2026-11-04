import type { ReactNode } from 'react'
import { LOCALE_IDS, type LanguagePreference } from '../../shared/locales'
import type { Settings } from '../../shared/settings'
import { LOCALES } from './i18n/catalog'
import { useI18n } from './i18n/I18nProvider'

interface Props {
  settings: Settings
  onChange(patch: Partial<Settings>): void
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: [T, string][]
  onChange(value: T): void
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([option, label]) => (
        <button
          key={option}
          role="radio"
          aria-checked={value === option}
          className={value === option ? 'selected' : undefined}
          onClick={() => onChange(option)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Setting({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div>
        <div className="setting-title">{title}</div>
        <div className="setting-description">{description}</div>
      </div>
      {children}
    </div>
  )
}

export function SettingsView({ settings, onChange }: Props) {
  const { t } = useI18n()

  return (
    <div className="settings">
      <div className="settings-inner">
        <h1>{t('settings.title')}</h1>

        <section>
          <h2>{t('settings.sections.general')}</h2>
          <Setting title={t('settings.language.title')} description={t('settings.language.description')}>
            <select
              className="select"
              value={settings.language}
              onChange={(event) => onChange({ language: event.target.value as LanguagePreference })}
            >
              <option value="system">{t('settings.language.system')}</option>
              {LOCALE_IDS.map((id) => (
                <option key={id} value={id} lang={id}>
                  {LOCALES[id].nativeName}
                </option>
              ))}
            </select>
          </Setting>
        </section>

        <section>
          <h2>{t('settings.sections.appearance')}</h2>
          <Setting title={t('settings.panelPosition.title')} description={t('settings.panelPosition.description')}>
            <Segmented
              value={settings.panelPosition}
              options={[
                ['left', t('settings.panelPosition.left')],
                ['right', t('settings.panelPosition.right')],
              ]}
              onChange={(panelPosition) => onChange({ panelPosition })}
            />
          </Setting>
        </section>

        <section>
          <h2>{t('settings.sections.terminal')}</h2>
          <Setting title={t('settings.cursor.title')} description={t('settings.cursor.description')}>
            <Segmented
              value={settings.terminalCursorStyle}
              options={[
                ['bar', t('settings.cursor.bar')],
                ['block', t('settings.cursor.block')],
                ['underline', t('settings.cursor.underline')],
              ]}
              onChange={(terminalCursorStyle) => onChange({ terminalCursorStyle })}
            />
          </Setting>
          <Setting title={t('settings.cursorBlink.title')} description={t('settings.cursorBlink.description')}>
            <Segmented
              value={settings.terminalCursorBlink ? 'on' : 'off'}
              options={[
                ['on', t('settings.cursorBlink.on')],
                ['off', t('settings.cursorBlink.off')],
              ]}
              onChange={(value) => onChange({ terminalCursorBlink: value === 'on' })}
            />
          </Setting>
        </section>
      </div>
    </div>
  )
}
