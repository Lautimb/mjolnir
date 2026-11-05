import { Plus, Trash2, X } from 'lucide-react'
import { Button, IconButton, TextInput } from '@mjolnir/plugin-sdk/react'
import { useT } from './i18n'
import type { Environment, Variable } from './model'

interface Props {
  environments: Environment[]
  onChange(environments: Environment[]): void
  onClose(): void
}

export function EnvironmentsEditor({ environments, onChange, onClose }: Props) {
  const t = useT()
  const update = (id: string, patch: Partial<Environment>) => onChange(environments.map((environment) => (environment.id === id ? { ...environment, ...patch } : environment)))
  const setVariable = (environment: Environment, index: number, patch: Partial<Variable>) =>
    update(environment.id, { variables: environment.variables.map((variable, current) => (current === index ? { ...variable, ...patch } : variable)) })

  return (
    <section className="environments">
      <div className="row">
        <h1>{t('environments')}</h1>
        <div className="spacer" />
        <Button
          onClick={() => onChange([...environments, { id: crypto.randomUUID(), name: t('newEnvironment', { count: environments.length + 1 }), variables: [] }])}
        >
          <Plus size={14} />
          {t('addEnvironment')}
        </Button>
        <Button variant="primary" onClick={onClose}>
          {t('done')}
        </Button>
      </div>
      <p className="hint">{t('environmentsHint')}</p>
      {environments.map((environment) => (
        <div key={environment.id} className="environment">
          <div className="row">
            <TextInput className="grow" aria-label={t('environmentName')} value={environment.name} onChange={(event) => update(environment.id, { name: event.target.value })} />
            <IconButton
              danger
              aria-label={t('removeEnvironment')}
              title={t('removeEnvironment')}
              onClick={() => onChange(environments.filter((candidate) => candidate.id !== environment.id))}
            >
              <Trash2 size={13} />
            </IconButton>
          </div>
          <div className="rows">
            {environment.variables.map((variable, index) => (
              <div key={index} className="row">
                <input type="checkbox" aria-label={t('enabled')} checked={variable.enabled} onChange={(event) => setVariable(environment, index, { enabled: event.target.checked })} />
                <TextInput
                  className="grow mono"
                  aria-label={t('variableName')}
                  placeholder={t('variableName')}
                  value={variable.name}
                  spellCheck={false}
                  onChange={(event) => setVariable(environment, index, { name: event.target.value })}
                />
                <TextInput
                  className="grow-2 mono"
                  aria-label={t('variableValue')}
                  placeholder={t('variableValue')}
                  value={variable.value}
                  spellCheck={false}
                  onChange={(event) => setVariable(environment, index, { value: event.target.value })}
                />
                <IconButton
                  danger
                  aria-label={t('removeVariable')}
                  title={t('removeVariable')}
                  onClick={() => update(environment.id, { variables: environment.variables.filter((_, current) => current !== index) })}
                >
                  <X size={14} />
                </IconButton>
              </div>
            ))}
            <div>
              <Button variant="ghost" onClick={() => update(environment.id, { variables: [...environment.variables, { name: '', value: '', enabled: true }] })}>
                <Plus size={14} />
                {t('addVariable')}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </section>
  )
}
