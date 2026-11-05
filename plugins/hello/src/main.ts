import { connect, HostError, type Mjolnir } from '@mjolnir/plugin-sdk'
import './style.css'

type Strings = Record<string, string>

async function loadStrings(locale: string): Promise<Strings> {
  const response = await fetch(`./locales/${locale}.json`).catch(() => null)
  if (response?.ok) return (await response.json()) as Strings
  return locale === 'es' ? {} : loadStrings('es')
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: Node[]): HTMLElementTagNameMap[K] {
  const node: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

function describe(error: unknown): string {
  return error instanceof HostError ? `${error.code}: ${error.message}` : String(error)
}

function action(mjolnir: Mjolnir, run: () => Promise<unknown>) {
  return () => run().catch((error: unknown) => mjolnir.ui.notify(describe(error), 'error'))
}

async function render(mjolnir: Mjolnir, root: HTMLElement) {
  const strings = await loadStrings(mjolnir.context.locale)
  const t = (key: string, params: Record<string, string | number> = {}) =>
    (strings[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))

  const count = element('p')
  const showCount = async () => (count.textContent = t('count', { count: (await mjolnir.storage.get<number>('count')) ?? 0 }))
  const increment = element('button', {
    textContent: t('increment'),
    onclick: action(mjolnir, async () => {
      await mjolnir.storage.set('count', ((await mjolnir.storage.get<number>('count')) ?? 0) + 1)
      await showCount()
    }),
  })

  const secretState = element('p')
  const showSecret = async () => {
    const secret = await mjolnir.secrets.get('demo')
    secretState.textContent = secret ? t('secretSaved', { length: secret.length }) : t('secretEmpty')
  }
  const secretInput = element('input', { type: 'password', placeholder: t('secretPlaceholder') })
  const saveSecret = element('button', {
    textContent: t('save'),
    onclick: action(mjolnir, async () => {
      await mjolnir.secrets.set('demo', secretInput.value)
      secretInput.value = ''
      await showSecret()
    }),
  })

  const output = element('pre', { hidden: true })
  const request = async (url: string) => {
    output.hidden = false
    try {
      const response = await mjolnir.http.request({ method: 'GET', url })
      output.textContent = `${response.status} ${response.statusText} · ${response.durationMs} ms\n\n${response.body.data}`
    } catch (error) {
      output.textContent = describe(error)
    }
  }

  root.replaceChildren(
    element('h1', { textContent: t('title') }),
    element('p', { textContent: t('intro') }),
    element('h2', { textContent: t('storage') }),
    count,
    element('div', { className: 'row' }, increment),
    element('h2', { textContent: t('secrets') }),
    secretState,
    element('div', { className: 'row' }, secretInput, saveSecret),
    element('h2', { textContent: t('network') }),
    element(
      'div',
      { className: 'row' },
      element('button', { textContent: t('fetch'), onclick: () => request('https://api.github.com/zen') }),
      element('button', { textContent: t('blocked'), onclick: () => request('https://example.com/') }),
      element('button', { textContent: t('notify'), onclick: () => mjolnir.ui.notify(t('notice')) }),
      element('button', { textContent: t('openDocs'), onclick: action(mjolnir, () => mjolnir.ui.openExternal('https://docs.github.com/rest')) }),
    ),
    output,
  )
  await Promise.all([showCount(), showSecret()])
}

const root = document.getElementById('app')!
const mjolnir = await connect()
await render(mjolnir, root)
mjolnir.onContextChange(() => void render(mjolnir, root))
