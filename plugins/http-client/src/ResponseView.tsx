import { useMemo, useState } from 'react'
import type { HttpResponse } from '@mjolnir/plugin-sdk'
import { Badge, EmptyState, Segmented } from '@mjolnir/plugin-sdk/react'
import { useT } from './i18n'
import { bodyBytes, DISPLAY_LIMIT, displayBody, formatBytes, statusTone } from './model'

export type Outcome = { kind: 'idle' } | { kind: 'response'; response: HttpResponse } | { kind: 'error'; message: string }

type Tab = 'body' | 'headers'

function Body({ response }: { response: HttpResponse }) {
  const t = useT()
  const body = useMemo(() => displayBody(response), [response])
  if (body.kind === 'binary') return <p className="hint">{t('binary', { size: formatBytes(body.bytes) })}</p>
  if (!body.text) return <p className="hint">{t('emptyBody')}</p>
  return (
    <>
      {body.truncated && <p className="hint">{t('truncated', { size: formatBytes(DISPLAY_LIMIT) })}</p>}
      <pre className="output">{body.text}</pre>
    </>
  )
}

export function ResponseView({ outcome }: { outcome: Outcome }) {
  const t = useT()
  const [tab, setTab] = useState<Tab>('body')

  if (outcome.kind === 'idle') return <EmptyState>{t('noResponse')}</EmptyState>
  if (outcome.kind === 'error') return <p className="hint error response-error">{outcome.message}</p>

  const { response } = outcome
  return (
    <section className="response">
      <div className="row">
        <Badge tone={statusTone(response.status)}>
          {response.status} {response.statusText}
        </Badge>
        <span className="meta">{response.durationMs} ms</span>
        <span className="meta">{formatBytes(bodyBytes(response))}</span>
        {response.redirects.length > 0 && (
          <span className="meta" title={response.redirects.join('\n')}>
            {t('redirected', { count: response.redirects.length })}
          </span>
        )}
        <div className="spacer" />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'body', label: t('responseBody') },
            { value: 'headers', label: `${t('responseHeaders')} (${response.headers.length})` },
          ]}
        />
      </div>
      {tab === 'body' ? (
        <Body response={response} />
      ) : (
        <table className="headers">
          <tbody>
            {response.headers.map(([name, value], index) => (
              <tr key={index}>
                <th>{name}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
