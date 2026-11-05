import { useHostContext } from '@mjolnir/plugin-sdk/react'

const es = {
  send: 'Enviar',
  sending: 'Enviando…',
  urlPlaceholder: 'https://api.ejemplo.com/recurso o {{base}}/recurso',
  method: 'Método',
  headers: 'Headers',
  body: 'Body',
  addHeader: 'Agregar header',
  headerName: 'Nombre',
  headerValue: 'Valor',
  removeHeader: 'Quitar header',
  enabled: 'Activo',
  bodyKinds: { none: 'Sin body', json: 'JSON', text: 'Texto' },
  bodyIgnored: '{method} no lleva body: no se va a enviar.',
  collection: 'Colección',
  history: 'Historial',
  noSession: 'Elegí una sesión de un repo para ver su colección.',
  emptyCollection: 'Todavía no hay requests guardados en {dir}.',
  loadingCollection: 'Cargando…',
  reload: 'Recargar',
  newRequest: 'Nuevo request',
  emptyHistory: 'Los requests que envíes aparecen acá.',
  clearHistory: 'Borrar historial',
  saveAs: 'Guardar en el repo como',
  savePlaceholder: 'carpeta/nombre',
  save: 'Guardar',
  saved: 'Guardado en {path}',
  invalidName: 'Usá un nombre sin \\ : * ? " < > | y sin carpetas vacías.',
  unsaved: 'Sin guardar',
  delete: 'Eliminar',
  confirmDelete: '¿Eliminar?',
  invalidFile: '{path} no es un request válido.',
  environment: 'Entorno',
  noEnvironment: 'Sin entorno',
  editEnvironments: 'Editar entornos',
  environments: 'Entornos',
  environmentsHint: 'Usá {{nombre}} en la URL, los headers o el body. Los entornos se guardan en esta máquina, no en el repo.',
  addEnvironment: 'Nuevo entorno',
  environmentName: 'Nombre del entorno',
  newEnvironment: 'Entorno {count}',
  removeEnvironment: 'Eliminar entorno',
  addVariable: 'Agregar variable',
  variableName: 'Variable',
  variableValue: 'Valor',
  removeVariable: 'Quitar variable',
  done: 'Listo',
  missingVariables: 'Variables sin definir en el entorno: {names}',
  response: 'Respuesta',
  noResponse: 'Enviá un request para ver la respuesta.',
  responseBody: 'Body',
  responseHeaders: 'Headers',
  binary: 'Respuesta binaria ({size}).',
  truncated: 'Se muestran los primeros {size}.',
  emptyBody: 'Sin body.',
  redirected: 'Redirigido {count} veces',
  errors: {
    permissionDenied: 'Mjolnir no permitió el request: {message}',
    timeout: 'El servidor no respondió a tiempo.',
    requestFailed: 'No se pudo completar el request: {message}',
    invalidRequest: 'Request inválido: {message}',
    quotaExceeded: 'Demasiado grande: {message}',
    unknown: 'Error: {message}',
  },
}

type Dictionary = typeof es

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }

const en: Widen<Dictionary> = {
  send: 'Send',
  sending: 'Sending…',
  urlPlaceholder: 'https://api.example.com/resource or {{base}}/resource',
  method: 'Method',
  headers: 'Headers',
  body: 'Body',
  addHeader: 'Add header',
  headerName: 'Name',
  headerValue: 'Value',
  removeHeader: 'Remove header',
  enabled: 'Enabled',
  bodyKinds: { none: 'No body', json: 'JSON', text: 'Text' },
  bodyIgnored: '{method} has no body: it will not be sent.',
  collection: 'Collection',
  history: 'History',
  noSession: 'Pick a session of a repo to see its collection.',
  emptyCollection: 'No requests saved in {dir} yet.',
  loadingCollection: 'Loading…',
  reload: 'Reload',
  newRequest: 'New request',
  emptyHistory: 'Requests you send show up here.',
  clearHistory: 'Clear history',
  saveAs: 'Save to the repo as',
  savePlaceholder: 'folder/name',
  save: 'Save',
  saved: 'Saved to {path}',
  invalidName: 'Use a name without \\ : * ? " < > | and without empty folders.',
  unsaved: 'Unsaved',
  delete: 'Delete',
  confirmDelete: 'Delete?',
  invalidFile: '{path} is not a valid request.',
  environment: 'Environment',
  noEnvironment: 'No environment',
  editEnvironments: 'Edit environments',
  environments: 'Environments',
  environmentsHint: 'Use {{name}} in the URL, headers or body. Environments are stored on this machine, not in the repo.',
  addEnvironment: 'New environment',
  environmentName: 'Environment name',
  newEnvironment: 'Environment {count}',
  removeEnvironment: 'Delete environment',
  addVariable: 'Add variable',
  variableName: 'Variable',
  variableValue: 'Value',
  removeVariable: 'Remove variable',
  done: 'Done',
  missingVariables: 'Variables not defined in the environment: {names}',
  response: 'Response',
  noResponse: 'Send a request to see the response.',
  responseBody: 'Body',
  responseHeaders: 'Headers',
  binary: 'Binary response ({size}).',
  truncated: 'Showing the first {size}.',
  emptyBody: 'No body.',
  redirected: 'Redirected {count} times',
  errors: {
    permissionDenied: 'Mjolnir did not allow the request: {message}',
    timeout: 'The server did not respond in time.',
    requestFailed: 'The request could not be completed: {message}',
    invalidRequest: 'Invalid request: {message}',
    quotaExceeded: 'Too large: {message}',
    unknown: 'Error: {message}',
  },
}

const DICTIONARIES: Record<string, Widen<Dictionary>> = { es, en }

type Paths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Paths<T[K], `${Prefix}${K}.`>
}[keyof T & string]

export type MessageKey = Paths<Dictionary>

export type T = (key: MessageKey, params?: Record<string, string | number>) => string

export function translate(locale: string, key: MessageKey, params: Record<string, string | number> = {}): string {
  const lookup = (dictionary: unknown) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dictionary)
  const template = lookup(DICTIONARIES[locale]) ?? lookup(es)
  return String(template).replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

export function useT(): T {
  const { locale } = useHostContext()
  return (key, params) => translate(locale, key, params)
}
