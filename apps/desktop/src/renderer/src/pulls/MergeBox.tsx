import { useState } from 'react'
import { GitMerge } from 'lucide-react'
import type { MergeMethod, PullRequestDetail } from '@mjolnir/core/browser'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { Button } from '../ui/Button'
import { FormError } from '../ui/fields'
import { Segmented } from '../ui/Segmented'

const PREFERRED: readonly MergeMethod[] = ['squash', 'merge', 'rebase']

interface Props {
  repoId: string
  detail: PullRequestDetail
  onMerged(): Promise<void>
}

export function MergeBox({ repoId, detail, onMerged }: Props) {
  const { t } = useI18n()
  const allowed = detail.mergeMethods ?? PREFERRED
  const [chosen, setChosen] = useState<MergeMethod | null>(null)
  const [deleteBranch, setDeleteBranch] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const method = chosen && allowed.includes(chosen) ? chosen : PREFERRED.find((candidate) => allowed.includes(candidate))
  const blocked = detail.draft ? t('pulls.merge.draft') : detail.mergeable === false ? t('pulls.merge.conflicts') : !detail.headSha ? t('pulls.merge.unknownHead') : null

  const merge = async () => {
    if (!method) return
    setMerging(true)
    try {
      await window.mjolnir.pulls.merge(repoId, detail.number, { method, sha: detail.headSha, deleteBranch })
      setError(null)
      await onMerged()
    } catch (err) {
      setError(err)
      setConfirming(false)
    } finally {
      setMerging(false)
    }
  }

  if (!method) return null

  return (
    <section className="flex flex-col gap-3 rounded-md border border-line-strong p-3">
      <header className="flex items-center gap-2 text-sm">
        <GitMerge size={15} className="text-merged" />
        <strong>{t('pulls.merge.title')}</strong>
        <span className="text-muted">{blocked ?? (detail.mergeable === true ? t('pulls.merge.ready') : detail.mergeable === null ? t('pulls.merge.checking') : null)}</span>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        {allowed.length > 1 && (
          <Segmented
            size="sm"
            label={t('pulls.merge.method')}
            value={method}
            options={allowed.map((value) => ({ value, label: t(`pulls.merge.methods.${value}`) }))}
            onChange={(value) => {
              setChosen(value)
              setConfirming(false)
            }}
          />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={deleteBranch} onChange={(event) => setDeleteBranch(event.target.checked)} />
          {t('pulls.merge.deleteBranch', { branch: detail.headRef })}
        </label>
        <span className="flex-1" />
        {confirming ? (
          <>
            <Button variant="ghost" disabled={merging} onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={merging} onClick={() => void merge()}>
              {merging ? t('pulls.merge.merging') : t('pulls.merge.confirm', { base: detail.baseRef })}
            </Button>
          </>
        ) : (
          <Button variant="primary" disabled={blocked !== null} onClick={() => setConfirming(true)}>
            {t(`pulls.merge.actions.${method}`)}
          </Button>
        )}
      </div>
      {error !== null && <FormError>{describeError(t, error)}</FormError>}
    </section>
  )
}
