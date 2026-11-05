import { useEffect, useState, type FormEvent } from 'react'
import { shortName, type BranchList, type PullRequestSummary } from '@mjolnir/core/browser'
import { BranchPicker } from '../BranchPicker'
import { describeError, useI18n } from '../i18n/I18nProvider'

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
    <form className="pull-detail pull-create" onSubmit={submit}>
      <h2>{t('pulls.create.title')}</h2>
      <code>
        {branch} → {baseBranch}
      </code>
      <label className="field">
        {t('pulls.create.titleLabel')}
        <input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <div className="field">
        {t('pulls.create.base')}
        <BranchPicker list={branches} value={selectedBase} refreshing={fetching} onChange={setBase} onRefresh={refresh} />
      </div>
      <label className="field">
        {t('pulls.create.body')}
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={10} />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} />
        {t('pulls.create.draft')}
      </label>
      <p className="setting-description">{t('pulls.create.pushHint')}</p>
      {error !== null && <div className="form-error">{describeError(t, error)}</div>}
      <div className="form-actions">
        <button type="button" className="button ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="button primary" disabled={busy || !title.trim()}>
          {busy ? t('pulls.create.submitting') : t('pulls.create.submit')}
        </button>
      </div>
    </form>
  )
}
