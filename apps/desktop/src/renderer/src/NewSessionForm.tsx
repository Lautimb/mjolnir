import { useEffect, useState, type FormEvent } from 'react'
import { findBranch, type BranchList, type Repo } from '@mjolnir/core/browser'
import { BranchPicker } from './BranchPicker'
import { errorMessage } from './model'

interface Props {
  repo: Repo
  fallbackBase: string
  onCreate(branch: string, base: string): Promise<void>
  onCancel(): void
}

export function NewSessionForm({ repo, fallbackBase, onCreate, onCancel }: Props) {
  const [branch, setBranch] = useState('')
  const [base, setBase] = useState<string | null>(null)
  const [branches, setBranches] = useState<BranchList | null>(null)
  const [fetching, setFetching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.mjolnir.repos.branches(repo.id).then(setBranches, (err: unknown) => setError(errorMessage(err)))
  }, [repo.id])

  const selectedBase = base ?? branches?.defaultBase ?? fallbackBase
  const match = branches && branch.trim() ? findBranch(branches.refs, branch.trim()) : undefined

  const refresh = async () => {
    setFetching(true)
    setError(null)
    try {
      setBranches(await window.mjolnir.repos.fetch(repo.id))
    } catch (err) {
      setError(errorMessage(err))
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
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form className="new-session" onSubmit={submit} onKeyDown={(event) => event.key === 'Escape' && onCancel()}>
      <label className="field">
        Branch
        <input
          autoFocus
          placeholder="feat/mi-feature"
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
          spellCheck={false}
        />
      </label>
      {match ? (
        <div className="field-hint">
          {match.remote
            ? `Existe en el remoto: se crea local siguiendo ${match.name}.`
            : 'Ya existe localmente: se abre esa branch.'}
        </div>
      ) : (
        <div className="field">
          Desde
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
          Cancelar
        </button>
        <button type="submit" className="button primary" disabled={busy || !branch.trim()}>
          {busy ? 'Creando…' : match ? 'Abrir sesión' : 'Crear sesión'}
        </button>
      </div>
    </form>
  )
}
