import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { languageFor, monaco } from './monaco'

export type DiffSide = 'left' | 'right'

export interface DiffZone {
  key: string
  side: DiffSide
  line: number
  content: ReactNode
}

export interface DiffAnnotations {
  zones: DiffZone[]
  onLineClick?(side: DiffSide, line: number): void
}

interface Props {
  path: string
  original: string
  modified: string
  sideBySide: boolean
  annotations?: DiffAnnotations
}

interface ZoneHost {
  outer: HTMLDivElement
  inner: HTMLDivElement
}

const ISOLATED_EVENTS = ['mousedown', 'pointerdown', 'contextmenu', 'keydown', 'keyup', 'keypress', 'copy', 'cut', 'paste']

function createHost(): ZoneHost {
  const outer = document.createElement('div')
  const inner = document.createElement('div')
  inner.className = 'max-w-3xl py-1.5 pr-4 pl-2 font-sans text-sm'
  outer.appendChild(inner)
  for (const type of ISOLATED_EVENTS) outer.addEventListener(type, (event) => event.stopPropagation())
  return { outer, inner }
}

export function MonacoDiff({ path, original, modified, sideBySide, annotations }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const annotationsRef = useRef(annotations)
  const hosts = useRef(new Map<string, ZoneHost>())
  const [modelVersion, setModelVersion] = useState(0)
  annotationsRef.current = annotations

  const zones = annotations?.zones ?? []
  const layout = zones.map((zone) => `${zone.key}@${zone.side}:${zone.line}`).join('|')
  const commentable = !!annotations?.onLineClick

  const host = (key: string) => {
    let existing = hosts.current.get(key)
    if (!existing) hosts.current.set(key, (existing = createHost()))
    return existing
  }

  useEffect(() => {
    const editor = monaco.editor.createDiffEditor(containerRef.current!, {
      theme: 'mjolnir',
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: sideBySide,
      useInlineViewWhenSpaceIsLimited: false,
      fontFamily: "'Cascadia Code', 'JetBrains Mono', Menlo, Consolas, monospace",
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 5 },
      stickyScroll: { enabled: false },
    })
    editorRef.current = editor

    const listeners = (['left', 'right'] as const).flatMap((side) => {
      const target = side === 'left' ? editor.getOriginalEditor() : editor.getModifiedEditor()
      const hover = target.createDecorationsCollection()
      const lineOf = (event: monaco.editor.IEditorMouseEvent) => {
        const type = event.target.type
        const inGutter = type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
        return inGutter && annotationsRef.current?.onLineClick ? (event.target.position?.lineNumber ?? null) : null
      }
      return [
        target.onMouseDown((event) => {
          const line = lineOf(event)
          if (line !== null) annotationsRef.current!.onLineClick!(side, line)
        }),
        target.onMouseMove((event) => {
          const line = lineOf(event)
          hover.set(
            line === null
              ? []
              : [{ range: new monaco.Range(line, 1, line, 1), options: { glyphMarginClassName: 'codicon codicon-add cursor-pointer text-accent' } }],
          )
        }),
        target.onMouseLeave(() => hover.clear()),
      ]
    })

    return () => {
      listeners.forEach((listener) => listener.dispose())
      const model = editor.getModel()
      editor.dispose()
      model?.original.dispose()
      model?.modified.dispose()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current!
    const language = languageFor(path)
    const previous = editor.getModel()
    editor.setModel({
      original: monaco.editor.createModel(original, language),
      modified: monaco.editor.createModel(modified, language),
    })
    previous?.original.dispose()
    previous?.modified.dispose()
    setModelVersion((version) => version + 1)
  }, [path, original, modified])

  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: sideBySide })
  }, [sideBySide])

  useEffect(() => {
    editorRef.current?.updateOptions({ glyphMargin: commentable })
  }, [commentable])

  useEffect(() => {
    const editor = editorRef.current
    const keys = new Set(zones.map((zone) => zone.key))
    for (const key of hosts.current.keys()) if (!keys.has(key)) hosts.current.delete(key)
    if (!editor || zones.length === 0) return

    const added = zones.map((zone) => {
      const target = zone.side === 'left' ? editor.getOriginalEditor() : editor.getModifiedEditor()
      const { outer, inner } = host(zone.key)
      const viewZone: monaco.editor.IViewZone = { afterLineNumber: zone.line, heightInPx: Math.max(inner.offsetHeight, 40), domNode: outer }
      let id = ''
      target.changeViewZones((accessor) => {
        id = accessor.addZone(viewZone)
      })
      const observer = new ResizeObserver(() => {
        const height = inner.offsetHeight
        if (!height || height === viewZone.heightInPx) return
        viewZone.heightInPx = height
        target.changeViewZones((accessor) => accessor.layoutZone(id))
      })
      observer.observe(inner)
      return { target, id, observer }
    })

    return () => {
      for (const { target, id, observer } of added) {
        observer.disconnect()
        if (editorRef.current) target.changeViewZones((accessor) => accessor.removeZone(id))
      }
    }
  }, [layout, modelVersion])

  return (
    <>
      <div ref={containerRef} className="absolute inset-0" />
      {zones.map((zone) => createPortal(zone.content, host(zone.key).inner, zone.key))}
    </>
  )
}
