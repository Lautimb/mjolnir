import { useEffect, useState, type FormEvent } from 'react'
import { findBranch, isSafeRef, type BranchList, type Repo } from '@mjolnir/core/browser'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { Button } from '../ui/Button'
import { Field, FormActions, FormError, TextInput } from '../ui/fields'
import { BranchPicker } from './BranchPicker'

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
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    window.mjolnir.repos.branches(repo.id).then(setBranches, setError)
  }, [repo.id])

  const name = branch.trim()
  const valid = isSafeRef(name)
  const selectedBase = base ?? branches?.defaultBase ?? fallbackBase
  const match = branches && name ? findBranch(branches.refs, name) : undefined

  const refresh = async () => {
    setFetching(true)
    setError(null)
    try {
      setBranches(await window.mjolnir.repos.fetch(repo.id))
    } catch (err) {
      setError(err)
    } finally {
      setFetching(false)
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    try {
      await onCreate(name, selectedBase)
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <form
      className="mt-1 mr-2 mb-2 ml-[26px] flex flex-col gap-2 rounded-md border border-line-strong bg-raised p-3"
      onSubmit={submit}
      onKeyDown={(event) => event.key === 'Escape' && onCancel()}
    >
      <Field label={t('newSession.branch')}>
        <TextInput
          autoFocus
          placeholder={t('newSession.branchPlaceholder')}
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          spellCheck={false}
        />
      </Field>
      {name && !valid && <FormError>{t('newSession.invalidBranch')}</FormError>}
      {match ? (
        <div className="text-sm text-muted">
          {match.remote ? t('newSession.existsRemote', { branch: match.name }) : t('newSession.existsLocal')}
        </div>
      ) : (
        <Field as="div" label={t('newSession.from')}>
          <BranchPicker list={branches} value={selectedBase} refreshing={fetching} onChange={setBase} onRefresh={refresh} />
        </Field>
      )}
      {error !== null && <FormError>{describeError(t, error)}</FormError>}
      <FormActions>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={busy || !valid}>
          {busy ? t('newSession.creating') : match ? t('newSession.open') : t('newSession.create')}
        </Button>
      </FormActions>
    </form>
  )
}
