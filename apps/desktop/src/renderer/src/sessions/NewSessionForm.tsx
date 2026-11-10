import { useEffect, useState, type FormEvent } from 'react'
import { findBranch, isSafeRef, renderPrompt, type BranchList, type Repo, type Ticket } from '@mjolnir/core/browser'
import { describeError, useI18n } from '../i18n/I18nProvider'
import { AGENTS, type Agent, type AgentId } from '../terminals/model'
import { Button } from '../ui/Button'
import { Field, FormActions, FormError, TextArea, TextInput } from '../ui/fields'
import { Segmented } from '../ui/Segmented'
import { BranchPicker } from './BranchPicker'
import { defaultTakePrompt } from './model'

export interface TakeLaunch {
  agent: Agent
  prompt: string
}

interface Props {
  repo: Repo
  initialBranch: string
  ticket?: Ticket
  fallbackBase: string
  onCreate(branch: string, base: string, take?: TakeLaunch): Promise<void>
  onCancel(): void
}

const NO_AGENT = 'none'

export function NewSessionForm({ repo, initialBranch, ticket, fallbackBase, onCreate, onCancel }: Props) {
  const { t } = useI18n()
  const [branch, setBranch] = useState(initialBranch)
  const [agentId, setAgentId] = useState<AgentId | typeof NO_AGENT>(AGENTS[0]!.id)
  const [template, setTemplate] = useState<string | null>(null)
  const [edited, setEdited] = useState<string | null>(null)
  const [base, setBase] = useState<string | null>(null)
  const [branches, setBranches] = useState<BranchList | null>(null)
  const [fetching, setFetching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    window.mjolnir.repos.branches(repo.id).then(setBranches, setError)
  }, [repo.id])

  useEffect(() => {
    if (!ticket) return
    window.mjolnir.repos.takePrompts(repo.id).then(
      ({ app, repo: shared }) => setTemplate(app ?? shared ?? defaultTakePrompt(t)),
      (err: unknown) => {
        setTemplate(defaultTakePrompt(t))
        setError(err)
      },
    )
  }, [repo.id, ticket, t])

  const name = branch.trim()
  const agent = AGENTS.find((candidate) => candidate.id === agentId)
  const rendered = ticket && template !== null ? renderPrompt(template, { ...ticket, branch: name }) : ''
  const prompt = edited ?? rendered
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
      await onCreate(name, selectedBase, agent && prompt.trim() ? { agent, prompt: prompt.trim() } : undefined)
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
      {ticket && (
        <>
          <Field as="div" label={t('newSession.agent')}>
            <Segmented
              size="sm"
              value={agentId}
              options={[...AGENTS.map(({ id, label }) => ({ value: id, label })), { value: NO_AGENT, label: t('newSession.noAgent') }]}
              onChange={setAgentId}
            />
          </Field>
          {agent && (
            <Field
              as="div"
              label={
                <span className="flex items-center justify-between">
                  {t('newSession.prompt')}
                  {edited !== null && (
                    <button type="button" className="text-accent hover:underline" onClick={() => setEdited(null)}>
                      {t('newSession.resetPrompt')}
                    </button>
                  )}
                </span>
              }
            >
              <TextArea
                rows={8}
                aria-label={t('newSession.prompt')}
                className="text-sm"
                value={prompt}
                disabled={template === null}
                onChange={(event) => setEdited(event.target.value)}
              />
            </Field>
          )}
          {agent && <div className="text-xs text-subtle">{t('newSession.promptReview')}</div>}
        </>
      )}
      {error !== null && <FormError>{describeError(t, error)}</FormError>}
      <FormActions>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={busy || !valid || (!!agent && !!ticket && !prompt.trim())}>
          {busy ? t('newSession.creating') : match ? t('newSession.open') : t('newSession.create')}
        </Button>
      </FormActions>
    </form>
  )
}
