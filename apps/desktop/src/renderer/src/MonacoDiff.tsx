import { useEffect, useRef } from 'react'
import { languageFor, monaco } from './monaco'

interface Props {
  path: string
  original: string
  modified: string
  sideBySide: boolean
}

export function MonacoDiff({ path, original, modified, sideBySide }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)

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
    return () => {
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
  }, [path, original, modified])

  useEffect(() => {
    editorRef.current?.updateOptions({ renderSideBySide: sideBySide })
  }, [sideBySide])

  return <div ref={containerRef} className="monaco-diff" />
}
