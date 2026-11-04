import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { Settings } from '../../shared/settings'
import type { Tab } from './model'

interface Props {
  tab: Tab
  active: boolean
  cursorStyle: Settings['terminalCursorStyle']
  cursorBlink: boolean
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

export function TerminalView({ tab, active, cursorStyle, cursorBlink, onExit }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const onExitRef = useRef(onExit)
  onExitRef.current = onExit

  useEffect(() => {
    const container = containerRef.current!
    const { pty } = window.mjolnir
    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace",
      fontSize: 13,
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
      .catch((error: unknown) => term.write(`\x1b[31m${String(error)}\x1b[0m\r\n`))

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
    if (!active) return
    fitRef.current?.fit()
    termRef.current?.focus()
  }, [active])

  return <div ref={containerRef} className={active ? 'terminal' : 'terminal hidden'} />
}
