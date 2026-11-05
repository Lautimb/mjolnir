import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { LOCALE_IDS, type LanguagePreference } from '../../../shared/locales'
import { TERMINAL_FONT_SIZE, type Settings } from '../../../shared/settings'
import { LOCALES } from '../i18n/catalog'
import { useI18n } from '../i18n/I18nProvider'
import { zoomed } from '../terminals/shortcuts'
import { IconButton } from '../ui/Button'
import { cx, eyebrow } from '../ui/cx'
import { Description } from '../ui/Description'
import { Select } from '../ui/fields'
import { Segmented } from '../ui/Segmented'
import { AccountsSettings } from './AccountsSettings'

interface Props {
  settings: Settings
  onChange(patch: Partial<Settings>): void
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className={cx(eyebrow, 'mb-2 text-subtle')}>{title}</h2>
      {children}
    </section>
  )
}

function Setting({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-line py-3">
      <div>
        <div className="font-medium">{title}</div>
        <Description>{description}</Description>
      </div>
      {children}
    </div>
  )
}

export function SettingsView({ settings, onChange }: Props) {
  const { t } = useI18n()

  return (
    <div className="col-[2/4] row-start-2 overflow-y-auto bg-canvas panel-right:col-[1/3]">
      <div className="mx-auto max-w-[720px] px-6 py-8">
        <h1 className="mb-6 text-xl font-semibold">{t('settings.title')}</h1>

        <Section title={t('settings.sections.general')}>
          <Setting title={t('settings.language.title')} description={t('settings.language.description')}>
            <Select value={settings.language} onChange={(event) => onChange({ language: event.target.value as LanguagePreference })}>
              <option value="system">{t('settings.language.system')}</option>
              {LOCALE_IDS.map((id) => (
                <option key={id} value={id} lang={id}>
                  {LOCALES[id].nativeName}
                </option>
              ))}
            </Select>
          </Setting>
        </Section>

        <Section title={t('accounts.title')}>
          <AccountsSettings />
        </Section>

        <Section title={t('settings.sections.appearance')}>
          <Setting title={t('settings.panelPosition.title')} description={t('settings.panelPosition.description')}>
            <Segmented
              value={settings.panelPosition}
              options={[
                { value: 'left', label: t('settings.panelPosition.left') },
                { value: 'right', label: t('settings.panelPosition.right') },
              ]}
              onChange={(panelPosition) => onChange({ panelPosition })}
            />
          </Setting>
        </Section>

        <Section title={t('settings.sections.terminal')}>
          <Setting title={t('settings.cursor.title')} description={t('settings.cursor.description')}>
            <Segmented
              value={settings.terminalCursorStyle}
              options={[
                { value: 'bar', label: t('settings.cursor.bar') },
                { value: 'block', label: t('settings.cursor.block') },
                { value: 'underline', label: t('settings.cursor.underline') },
              ]}
              onChange={(terminalCursorStyle) => onChange({ terminalCursorStyle })}
            />
          </Setting>
          <Setting title={t('settings.fontSize.title')} description={t('settings.fontSize.description', { size: TERMINAL_FONT_SIZE.default })}>
            <div className="flex flex-none items-center gap-1">
              <IconButton
                aria-label={t('settings.fontSize.decrease')}
                title={t('settings.fontSize.decrease')}
                disabled={settings.terminalFontSize <= TERMINAL_FONT_SIZE.min}
                onClick={() => onChange({ terminalFontSize: zoomed(settings.terminalFontSize, 'zoomOut') })}
              >
                <Minus size={14} />
              </IconButton>
              <span className="w-8 text-center text-sm tabular-nums">{settings.terminalFontSize}</span>
              <IconButton
                aria-label={t('settings.fontSize.increase')}
                title={t('settings.fontSize.increase')}
                disabled={settings.terminalFontSize >= TERMINAL_FONT_SIZE.max}
                onClick={() => onChange({ terminalFontSize: zoomed(settings.terminalFontSize, 'zoomIn') })}
              >
                <Plus size={14} />
              </IconButton>
            </div>
          </Setting>
          <Setting title={t('settings.cursorBlink.title')} description={t('settings.cursorBlink.description')}>
            <Segmented
              value={settings.terminalCursorBlink ? 'on' : 'off'}
              options={[
                { value: 'on', label: t('settings.cursorBlink.on') },
                { value: 'off', label: t('settings.cursorBlink.off') },
              ]}
              onChange={(value) => onChange({ terminalCursorBlink: value === 'on' })}
            />
          </Setting>
        </Section>
      </div>
    </div>
  )
}
