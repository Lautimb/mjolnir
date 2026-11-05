import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/basic-languages/monaco.contribution'
import 'monaco-editor-codicons.css'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

monaco.editor.defineTheme('mjolnir', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#111216',
    'editor.foreground': '#e4e5e9',
    'editorGutter.background': '#111216',
    'editorLineNumber.foreground': '#5f616c',
    'editorLineNumber.activeForeground': '#8d8f9a',
    'editor.lineHighlightBackground': '#16171c',
    'diffEditor.insertedTextBackground': '#5fc88f26',
    'diffEditor.insertedLineBackground': '#5fc88f14',
    'diffEditor.removedTextBackground': '#f0646a2e',
    'diffEditor.removedLineBackground': '#f0646a14',
    'diffEditorGutter.insertedLineBackground': '#5fc88f1f',
    'diffEditorGutter.removedLineBackground': '#f0646a1f',
    'diffEditor.border': '#23242b',
    'scrollbarSlider.background': '#31323b99',
    'scrollbarSlider.hoverBackground': '#5f616c99',
  },
})

export function languageFor(path: string): string {
  const name = path.split('/').pop()!.toLowerCase()
  const match = monaco.languages
    .getLanguages()
    .find(
      (language) =>
        language.filenames?.some((filename) => filename.toLowerCase() === name) ||
        language.extensions?.some((extension) => name.endsWith(extension.toLowerCase())),
    )
  return match?.id ?? 'plaintext'
}

export { monaco }
