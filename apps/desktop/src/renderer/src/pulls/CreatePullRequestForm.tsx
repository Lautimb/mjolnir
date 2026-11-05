import { useEffect, useState, type FormEvent } from 'react'
import { shortName, type BranchList, type PullRequestSummary } from '@mjolnir/core/browser'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { BranchPicker } from '../sessions/BranchPicker'
import { Button } from '../ui/Button'
import { Field, FormActions, FormError, TextArea, TextInput } from '../ui/fields'

interface Props {
  repoId: string
  branch: string
  worktreePath: string
  onCreated(pull: PullRequestSummary): void
  onCancel(): void
}

export function titleFromBranch(branch: string): string {
  const [type, ...rest] = branch.split('/')
  const words = (rest.length > 0 ? rest.join('/') : type!).replace(/[-_]+/g, ' ').trim()
  return rest.length > 0 ? `${type}: ${words}` : words
}

export function CreatePullRequestForm({ repoId, branch, worktreePath, onCreated, onCancel }: Props) {
  const { t } = useI18n()
  const [title, setTitle] = useState(() => titleFromBranch(branch))
  const [body, setBody] = useState('')
  const [draft, setDraft] = useState(false)
  const [branches, setBranches] = useState<BranchList | null>(null)
  const [base, setBase] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    window.mjolnir.repos.branches(repoId).then(setBranches, setError)
  }, [repoId])

  const selectedBase = base ?? branches?.defaultBase ?? 'main'
  const baseRef = branches?.refs.find((ref) => ref.name === selectedBase)
  const baseBranch = baseRef ? shortName(baseRef) : selectedBase

  const refresh = async () => {
    setFetching(true)
    try {
      setBranches(await window.mjolnir.repos.fetch(repoId))
    } catch (err) {
      setError(err)
    } finally {
      setFetching(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(await window.mjolnir.pulls.create(repoId, worktreePath, { head: branch, base: baseBranch, title: title.trim(), body, draft }))
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <form className="flex max-w-[760px] min-h-0 min-w-0 flex-col gap-3 overflow-y-auto px-6 py-4" onSubmit={submit}>
      <h2 className="text-xl">{t('pulls.create.title')}</h2>
      <code className="font-mono text-sm text-muted">
        {branch} → {baseBranch}
      </code>
      <Field label={t('pulls.create.titleLabel')}>
        <TextInput autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
      </Field>
      <Field as="div" label={t('pulls.create.base')}>
        <BranchPicker list={branches} value={selectedBase} refreshing={fetching} onChange={setBase} onRefresh={refresh} />
      </Field>
      <Field label={t('pulls.create.body')}>
        <TextArea value={body} onChange={(event) => setBody(event.target.value)} rows={10} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />
        {t('pulls.create.draft')}
      </label>
      <p className="text-sm text-muted">{t('pulls.create.pushHint')}</p>
      {error !== null && <FormError>{describeError(t, error)}</FormError>}
      <FormActions>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={busy || !title.trim()}>
          {busy ? t('pulls.create.submitting') : t('pulls.create.submit')}
        </Button>
      </FormActions>
    </form>
  )
}
