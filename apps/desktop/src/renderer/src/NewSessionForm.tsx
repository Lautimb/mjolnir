import { useEffect, useState, type FormEvent } from 'react'
import { findBranch, type BranchList, type Repo } from '@mjolnir/core/browser'
import { BranchPicker } from './BranchPicker'
import { describeError, useI18n } from './i18n/I18nProvider'

interface Props {
  repo: Repo
  fallbackBase: string
  onCreate(branch: string, base: string): Promise<void>
  onCancel(): void
}

export function NewSessionForm({ repo, fallbackBase, onCreate, onCancel }: Props) {
  const { t } = useI18n()
  const [branch, setBranch] = useState('')
  const [base, setBase] = useState<string | null>(null)
  const [branches, setBranches] = useState<BranchList | null>(null)
  const [fetching, setFetching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.mjolnir.repos.branches(repo.id).then(setBranches, (err: unknown) => setError(describeError(t, err)))
  }, [repo.id, t])

  const selectedBase = base ?? branches?.defaultBase ?? fallbackBase
  const match = branches && branch.trim() ? findBranch(branches.refs, branch.trim()) : undefined

  const refresh = async () => {
    setFetching(true)
    setError(null)
    try {
      setBranches(await window.mjolnir.repos.fetch(repo.id))
    } catch (err) {
      setError(describeError(t, err))
    } finally {
      setFetching(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!branch.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(branch.trim(), selectedBase)
    } catch (err) {
      setError(describeError(t, err))
      setBusy(false)
    }
  }

  return (
    <form className="new-session" onSubmit={submit} onKeyDown={(event) => event.key === 'Escape' && onCancel()}>
      <label className="field">
        {t('newSession.branch')}
        <input
          autoFocus
          placeholder={t('newSession.branchPlaceholder')}
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          spellCheck={false}
        />
      </label>
      {match ? (
        <div className="field-hint">
          {match.remote ? t('newSession.existsRemote', { branch: match.name }) : t('newSession.existsLocal')}
        </div>
      ) : (
        <div className="field">
          {t('newSession.from')}
          <BranchPicker
            list={branches}
            value={selectedBase}
            refreshing={fetching}
            onChange={setBase}
            onRefresh={refresh}
          />
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <button type="button" className="button ghost" onClick={onCancel}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="button primary" disabled={busy || !branch.trim()}>
          {busy ? t('newSession.creating') : match ? t('newSession.open') : t('newSession.create')}
        </button>
      </div>
    </form>
  )
}
