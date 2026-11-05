import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { Settings } from '../../../shared/settings'
import { describeError, useI18n } from '../i18n/I18nProvider'
import type { Tab } from './model'
import { terminalShortcut, zoomed } from './shortcuts'

interface Props {
  tab: Tab
  active: boolean
  cursorStyle: Settings['terminalCursorStyle']
  cursorBlink: boolean
  fontSize: number
  onFontSizeChange(fontSize: number): void
  onExit(exitCode: number): void
}

const theme = {
  background: '#111216',
  foreground: '#e4e5e9',
  cursor: '#f5c451',
  cursorAccent: '#111216',
  selectionBackground: '#3a3c47',
  black: '#1c1d23',
  brightBlack: '#5f616c',
}

export function TerminalView({ tab, active, cursorStyle, cursorBlink, fontSize, onFontSizeChange, onExit }: Props) {
  const { t } = useI18n()
  const describe = useRef((error: unknown) => describeError(t, error))
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit
  const zoomRef = useRef({ fontSize, onFontSizeChange })
  zoomRef.current = { fontSize, onFontSizeChange }

  useEffect(() => {
    const container = containerRef.current!
    const { pty } = window.mjolnir
    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace",
      fontSize,
      lineHeight: 1.15,
      cursorBlink,
      cursorStyle,
      cursorInactiveStyle: 'outline',
      allowProposedApi: true,
      theme,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri)))
    term.open(container)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      const shortcut = terminalShortcut(event, window.mjolnir.platform, term.hasSelection())
      if (!shortcut) return true
      if (shortcut === 'paste') return false
      event.preventDefault()
      if (shortcut === 'copy') {
        void navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
      } else {
        zoomRef.current.onFontSizeChange(zoomed(zoomRef.current.fontSize, shortcut))
      }
      return false
    })
    term.attachCustomWheelEventHandler((event) => {
      if (!(window.mjolnir.platform === 'darwin' ? event.metaKey : event.ctrlKey) || !event.deltaY) return true
      event.preventDefault()
      zoomRef.current.onFontSizeChange(zoomed(zoomRef.current.fontSize, event.deltaY < 0 ? 'zoomIn' : 'zoomOut'))
      return false
    })

    const offData = pty.onData((id, data) => id === tab.id && term.write(data))
    const offExit = pty.onExit((id, code) => id === tab.id && onExitRef.current(code))
    const input = term.onData((data) => pty.write(tab.id, data))
    const resize = term.onResize(({ cols, rows }) => pty.resize(tab.id, cols, rows))

    pty
      .spawn({
        id: tab.id,
        profileId: tab.profile.id,
        cols: term.cols,
        rows: term.rows,
        cwd: tab.cwd,
        initialInput: tab.initialInput,
      })
      .catch((error: unknown) => term.write(`\x1b[31m${describe.current(error)}\x1b[0m\r\n`))

    const observer = new ResizeObserver(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) fit.fit()
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      offData()
      offExit()
      input.dispose()
      resize.dispose()
      pty.kill(tab.id)
      term.dispose()
    }
  }, [tab.id])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.cursorStyle = cursorStyle
    termRef.current.options.cursorBlink = cursorBlink
  }, [cursorStyle, cursorBlink])

  useEffect(() => {
    if (!termRef.current || termRef.current.options.fontSize === fontSize) return
    termRef.current.options.fontSize = fontSize
    fitRef.current?.fit()
  }, [fontSize])

  useEffect(() => {
    if (!active) return
    fitRef.current?.fit()
    termRef.current?.focus()
  }, [active])

  return <div ref={containerRef} hidden={!active} className="absolute inset-0 pt-2 pl-3" />
}
