import { useMemo, useState } from 'react'
import { useHostContext, useMjolnir } from '@mjolnir/plugin-sdk/react'
import { EnvironmentsEditor } from './EnvironmentsEditor'
import { describeError } from './errors'
import { useT } from './i18n'
import {
  addToHistory,
  buildRequest,
  emptyRequest,
  parseRequestFile,
  requestName,
  requestPath,
  sameRequest,
  serializeRequest,
  type Environment,
  type HistoryEntry,
  type RequestSpec,
} from './model'
import { RequestEditor } from './RequestEditor'
import { ResponseView, type Outcome } from './ResponseView'
import { Sidebar } from './Sidebar'
import { useCollection } from './useCollection'
import { usePersistent } from './usePersistent'

interface Draft {
  request: RequestSpec
  name: string
  path: string | null
  saved: RequestSpec | null
}

const newDraft = (): Draft => ({ request: emptyRequest(), name: '', path: null, saved: null })

export function App() {
  const t = useT()
  const mjolnir = useMjolnir()
  const { session } = useHostContext()
  const collection = useCollection(session)
  const [draft, setDraft, draftLoaded] = usePersistent<Draft>('draft', newDraft())
  const [history, setHistory] = usePersistent<HistoryEntry[]>('history', [])
  const [environments, setEnvironments] = usePersistent<Environment[]>('environments', [])
  const [environmentId, setEnvironmentId] = usePersistent<string | null>('environment', null)
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  const [sending, setSending] = useState(false)
  const [editingEnvironments, setEditingEnvironments] = useState(false)

  const environment = environments.find((candidate) => candidate.id === environmentId) ?? null
  const { missing } = useMemo(() => buildRequest(draft.request, environment), [draft.request, environment])
  const dirty = !!draft.path && (!draft.saved || !sameRequest(draft.saved, draft.request) || requestPath(draft.name) !== draft.path)
  const fail = (error: unknown) => mjolnir.ui.notify(describeError(t, error), 'error')

  const send = async () => {
    if (sending || !draft.request.url.trim()) return
    const { request } = buildRequest(draft.request, environment)
    setSending(true)
    let status: number | null = null
    let durationMs: number | null = null
    try {
      const response = await mjolnir.http.request(request)
      status = response.status
      durationMs = response.durationMs
      setOutcome({ kind: 'response', response })
    } catch (error) {
      setOutcome({ kind: 'error', message: describeError(t, error) })
    } finally {
      setSending(false)
    }
    setHistory((current) => addToHistory(current, { id: crypto.randomUUID(), at: Date.now(), request: draft.request, status, durationMs }))
  }

  const open = async (path: string) => {
    if (!session) return
    try {
      const content = await mjolnir.repoFiles.read(session, path)
      const request = content === null ? null : parseRequestFile(content)
      if (!request) return mjolnir.ui.notify(t('invalidFile', { path }), 'error')
      setDraft({ request, name: requestName(path), path, saved: request })
      setOutcome({ kind: 'idle' })
    } catch (error) {
      fail(error)
    }
  }

  const save = async () => {
    if (!session) return
    const path = requestPath(draft.name)
    if (!path) return mjolnir.ui.notify(t('invalidName'), 'error')
    try {
      await mjolnir.repoFiles.write(session, path, serializeRequest(draft.request))
      setDraft((current) => ({ ...current, path, saved: current.request }))
      collection.reload()
      mjolnir.ui.notify(t('saved', { path }))
    } catch (error) {
      fail(error)
    }
  }

  const remove = async () => {
    if (!session || !draft.path) return
    try {
      await mjolnir.repoFiles.delete(session, draft.path)
      setDraft((current) => ({ ...current, path: null, saved: null }))
      collection.reload()
    } catch (error) {
      fail(error)
    }
  }

  if (!draftLoaded) return null

  return (
    <div className="layout">
      <Sidebar
        session={session}
        collection={collection.state}
        openPath={draft.path}
        history={history}
        environments={environments}
        environmentId={environment?.id ?? null}
        onOpen={(path) => void open(path)}
        onReload={collection.reload}
        onNew={() => {
          setDraft(newDraft())
          setOutcome({ kind: 'idle' })
        }}
        onRestore={(entry) => setDraft({ request: entry.request, name: '', path: null, saved: null })}
        onClearHistory={() => setHistory([])}
        onEnvironmentChange={setEnvironmentId}
        onEditEnvironments={() => setEditingEnvironments(true)}
      />
      <main className="main">
        {editingEnvironments ? (
          <EnvironmentsEditor environments={environments} onChange={setEnvironments} onClose={() => setEditingEnvironments(false)} />
        ) : (
          <>
            <RequestEditor
              request={draft.request}
              sending={sending}
              canSave={!!session}
              name={draft.name}
              dirty={dirty}
              missing={missing}
              onChange={(request) => setDraft((current) => ({ ...current, request }))}
              onSend={() => void send()}
              onNameChange={(name) => setDraft((current) => ({ ...current, name }))}
              onSave={() => void save()}
              onDelete={draft.path ? () => void remove() : null}
            />
            <ResponseView outcome={outcome} />
          </>
        )}
      </main>
    </div>
  )
}
