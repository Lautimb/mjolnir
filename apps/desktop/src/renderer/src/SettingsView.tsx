import type { ReactNode } from 'react'
import type { Settings } from '../../shared/settings'

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
  return (
    <div className="settings">
      <div className="settings-inner">
        <h1>Ajustes</h1>

        <section>
          <h2>Apariencia</h2>
          <Setting title="Posición del panel" description="Lado de la ventana donde van el panel de sesiones y la barra de vistas.">
            <Segmented
              value={settings.panelPosition}
              options={[
                ['left', 'Izquierda'],
                ['right', 'Derecha'],
              ]}
              onChange={(panelPosition) => onChange({ panelPosition })}
            />
          </Setting>
        </section>

        <section>
          <h2>Terminal</h2>
          <Setting title="Cursor" description="Forma del cursor dentro de las terminales.">
            <Segmented
              value={settings.terminalCursorStyle}
              options={[
                ['bar', 'Barra'],
                ['block', 'Bloque'],
                ['underline', 'Subrayado'],
              ]}
              onChange={(terminalCursorStyle) => onChange({ terminalCursorStyle })}
            />
          </Setting>
          <Setting title="Parpadeo del cursor" description="El cursor parpadea mientras la terminal tiene foco.">
            <Segmented
              value={settings.terminalCursorBlink ? 'on' : 'off'}
              options={[
                ['on', 'Sí'],
                ['off', 'No'],
              ]}
              onChange={(value) => onChange({ terminalCursorBlink: value === 'on' })}
            />
          </Setting>
        </section>
      </div>
    </div>
  )
}
