import { useEffect, useState, type FormEvent } from 'react'
import { PROMPT_VARS, TAKE_PROMPT_FILE, type Repo } from '@mjolnir/core/browser'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { FormActions, FormError, TextArea } from '../ui/fields'
import { popover } from '../ui/Menu'
import { defaultTakePrompt } from './model'

interface Props {
  repo: Repo
  onClose(): void
}

export function TakePromptDialog({ repo, onClose }: Props) {
  const { t } = useI18n()
  const [fallback, setFallback] = useState('')
  const [value, setValue] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    window.mjolnir.repos.takePrompts(repo.id).then(
      ({ app, repo: shared }) => {
        setFallback(shared ?? defaultTakePrompt(t))
        setValue(app ?? '')
      },
      setError,
    )
  }, [repo.id, t])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (value === null) return
    setBusy(true)
    setError(null)
    try {
      await window.mjolnir.repos.setTakePrompt(repo.id, value.trim() || null)
      onClose()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-scrim px-4 pt-[12vh] pb-4" onMouseDown={onClose}>
      <form
        role="dialog"
        aria-label={t('take.title', { repo: repo.name })}
        className={cx(popover, 'flex max-h-full w-[min(620px,100%)] flex-col gap-3 overflow-y-auto rounded-lg p-4')}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
        onSubmit={submit}
      >
        <div className="font-semibold">{t('take.title', { repo: repo.name })}</div>
        <p className="text-sm text-muted">
          {t('take.hint', { file: TAKE_PROMPT_FILE, vars: PROMPT_VARS.map((name) => `{${name}}`).join(' ') })}
        </p>
        <TextArea
          autoFocus
          rows={12}
          className="font-mono text-sm"
          aria-label={t('take.title', { repo: repo.name })}
          placeholder={fallback}
          value={value ?? ''}
          disabled={value === null}
          onChange={(event) => setValue(event.target.value)}
        />
        {error !== null && <FormError>{describeError(t, error)}</FormError>}
        <FormActions>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || value === null}>
            {t('take.save')}
          </Button>
        </FormActions>
      </form>
    </div>
  )
}
