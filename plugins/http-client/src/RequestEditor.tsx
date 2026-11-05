import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge, Button, IconButton, Segmented, Select, TextArea, TextInput } from '@mjolnir/plugin-sdk/react'
import { useT } from './i18n'
import { METHODS, type BodyKind, type Header, type RequestSpec } from './model'

type Tab = 'headers' | 'body'

function HeadersTable({ headers, onChange }: { headers: Header[]; onChange(headers: Header[]): void }) {
  const t = useT()
  const set = (index: number, patch: Partial<Header>) => onChange(headers.map((header, current) => (current === index ? { ...header, ...patch } : header)))
  return (
    <div className="rows">
      {headers.map((header, index) => (
        <div key={index} className="row">
          <input type="checkbox" aria-label={t('enabled')} checked={header.enabled} onChange={(event) => set(index, { enabled: event.target.checked })} />
          <TextInput className="grow" aria-label={t('headerName')} placeholder={t('headerName')} value={header.name} onChange={(event) => set(index, { name: event.target.value })} />
          <TextInput className="grow-2" aria-label={t('headerValue')} placeholder={t('headerValue')} value={header.value} onChange={(event) => set(index, { value: event.target.value })} />
          <IconButton danger aria-label={t('removeHeader')} title={t('removeHeader')} onClick={() => onChange(headers.filter((_, current) => current !== index))}>
            <X size={14} />
          </IconButton>
        </div>
      ))}
      <div>
        <Button variant="ghost" onClick={() => onChange([...headers, { name: '', value: '', enabled: true }])}>
          <Plus size={14} />
          {t('addHeader')}
        </Button>
      </div>
    </div>
  )
}

interface Props {
  request: RequestSpec
  sending: boolean
  canSave: boolean
  name: string
  dirty: boolean
  missing: string[]
  onChange(request: RequestSpec): void
  onSend(): void
  onNameChange(name: string): void
  onSave(): void
  onDelete: (() => void) | null
}

export function RequestEditor({ request, sending, canSave, name, dirty, missing, onChange, onSend, onNameChange, onSave, onDelete }: Props) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('headers')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const set = (patch: Partial<RequestSpec>) => onChange({ ...request, ...patch })
  const bodyIgnored = request.body.kind !== 'none' && ['GET', 'HEAD'].includes(request.method)
  const activeHeaders = request.headers.filter((header) => header.enabled && header.name).length

  return (
    <section
      className="editor"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          onSend()
        }
      }}
    >
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault()
          onSend()
        }}
      >
        <Select aria-label={t('method')} className="method-select" value={request.method} onChange={(event) => set({ method: event.target.value })}>
          {METHODS.map((method) => (
            <option key={method}>{method}</option>
          ))}
        </Select>
        <TextInput className="grow mono" aria-label="URL" placeholder={t('urlPlaceholder')} value={request.url} spellCheck={false} onChange={(event) => set({ url: event.target.value })} />
        <Button type="submit" variant="primary" disabled={sending || !request.url.trim()}>
          {sending ? t('sending') : t('send')}
        </Button>
      </form>
      {missing.length > 0 && <p className="hint error">{t('missingVariables', { names: missing.join(', ') })}</p>}
      {canSave && (
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <label className="save-label" htmlFor="request-name">
            {t('saveAs')}
          </label>
          <TextInput id="request-name" className="grow mono" placeholder={t('savePlaceholder')} value={name} spellCheck={false} onChange={(event) => onNameChange(event.target.value)} />
          {dirty && <Badge tone="accent">{t('unsaved')}</Badge>}
          <Button type="submit" disabled={!name.trim()}>
            {t('save')}
          </Button>
          {onDelete &&
            (confirmingDelete ? (
              <Button
                variant="ghost"
                className="danger"
                onBlur={() => setConfirmingDelete(false)}
                onClick={() => {
                  setConfirmingDelete(false)
                  onDelete()
                }}
              >
                {t('confirmDelete')}
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
                {t('delete')}
              </Button>
            ))}
        </form>
      )}
      <div className="row">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'headers', label: activeHeaders ? `${t('headers')} (${activeHeaders})` : t('headers') },
            { value: 'body', label: request.body.kind === 'none' ? t('body') : `${t('body')} · ${t(`bodyKinds.${request.body.kind}`)}` },
          ]}
        />
        {tab === 'body' && (
          <Select aria-label={t('body')} value={request.body.kind} onChange={(event) => set({ body: { ...request.body, kind: event.target.value as BodyKind } })}>
            {(['none', 'json', 'text'] as const).map((kind) => (
              <option key={kind} value={kind}>
                {t(`bodyKinds.${kind}`)}
              </option>
            ))}
          </Select>
        )}
      </div>
      {tab === 'headers' ? (
        <HeadersTable headers={request.headers} onChange={(headers) => set({ headers })} />
      ) : (
        request.body.kind !== 'none' && (
          <>
            {bodyIgnored && <p className="hint">{t('bodyIgnored', { method: request.method })}</p>}
            <TextArea className="mono body-input" rows={8} spellCheck={false} value={request.body.text} onChange={(event) => set({ body: { ...request.body, text: event.target.value } })} />
          </>
        )
      )}
    </section>
  )
}
