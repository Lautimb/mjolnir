import { useHostContext } from '@mjolnir/plugin-sdk/react'

const es = {
  organization: 'Organización',
  organizationPlaceholder: 'nombre-de-la-org',
  project: 'Proyecto',
  team: 'Equipo',
  board: 'Tablero',
  iteration: 'Iteración',
  currentIteration: 'Actual ({name})',
  noCurrentIteration: 'Actual (no hay)',
  allIterations: 'Todas',
  mine: 'Asignados a mí',
  search: 'Buscar por título, #id o tag',
  refresh: 'Actualizar',
  loading: 'Cargando…',
  pick: 'Elegí…',
  unassigned: 'Sin asignar',
  doneHalf: 'Hecho',
  openItem: 'Abrir #{id} en Azure DevOps',
  sessionBranch: 'Linkeado a la branch de la sesión',
  pullRequests: '{count} PR',
  moveHint: 'Arrastrá la card o usá Alt + ← / → para moverla de columna. Clic o Enter para ver el detalle.',
  close: 'Cerrar',
  state: 'Estado',
  assignee: 'Asignada a',
  noDescription: 'Sin descripción.',
  branch: 'Branch',
  take: 'Tomar',
  createSession: 'Crear sesión',
  taking: 'Tomando…',
  takeHint: 'Te la asigna, la pasa a la primera columna en curso y abre una nueva sesión en {repo} con esta branch, para que elijas de dónde parte.',
  takeNoSession: 'Te la asigna y la pasa a la primera columna en curso. Para crear la sesión, elegí antes una sesión del repo.',
  moveNotAllowed: '{type} no tiene estado en «{column}».',
  truncated: 'Se muestran los {count} cambiados más recientemente.',
  emptyColumn: 'Nada acá.',
  noAccount: 'Conectá una cuenta de Azure DevOps en Ajustes → Cuentas para ver tus tableros.',
  outdated: 'Esta vista necesita una versión más nueva de Mjolnir.',
  noOrganizations: 'No se encontraron organizaciones para tu cuenta: escribí el nombre de la tuya.',
  chooseScope: 'Elegí organización, proyecto y equipo para ver el tablero.',
  noBoards: 'El equipo no tiene tableros.',
  retry: 'Reintentar',
  errors: {
    unauthorized: 'Azure DevOps rechazó la cuenta. Reconectala en Ajustes → Cuentas.',
    permissionDenied: 'Mjolnir no permitió el request: {message}',
    timeout: 'Azure DevOps no respondió a tiempo.',
    requestFailed: 'Azure DevOps respondió con un error: {message}',
    invalidRequest: 'Request inválido: {message}',
    unknown: 'Error: {message}',
  },
}

type Dictionary = typeof es

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }

const en: Widen<Dictionary> = {
  organization: 'Organization',
  organizationPlaceholder: 'org-name',
  project: 'Project',
  team: 'Team',
  board: 'Board',
  iteration: 'Iteration',
  currentIteration: 'Current ({name})',
  noCurrentIteration: 'Current (none)',
  allIterations: 'All',
  mine: 'Assigned to me',
  search: 'Search by title, #id or tag',
  refresh: 'Refresh',
  loading: 'Loading…',
  pick: 'Pick…',
  unassigned: 'Unassigned',
  doneHalf: 'Done',
  openItem: 'Open #{id} in Azure DevOps',
  sessionBranch: 'Linked to the session branch',
  pullRequests: '{count} PR',
  moveHint: 'Drag the card or use Alt + ← / → to move it to another column. Click or Enter to see the details.',
  close: 'Close',
  state: 'State',
  assignee: 'Assigned to',
  noDescription: 'No description.',
  branch: 'Branch',
  take: 'Take',
  createSession: 'Create session',
  taking: 'Taking…',
  takeHint: 'Assigns it to you, moves it to the first in-progress column and opens a new session in {repo} with this branch, so you pick where it starts from.',
  takeNoSession: 'Assigns it to you and moves it to the first in-progress column. To create the session, pick a session of the repo first.',
  moveNotAllowed: '{type} has no state in “{column}”.',
  truncated: 'Showing the {count} most recently changed.',
  emptyColumn: 'Nothing here.',
  noAccount: 'Connect an Azure DevOps account in Settings → Accounts to see your boards.',
  outdated: 'This view needs a newer version of Mjolnir.',
  noOrganizations: 'No organizations were found for your account: type the name of yours.',
  chooseScope: 'Pick an organization, project and team to see the board.',
  noBoards: 'The team has no boards.',
  retry: 'Retry',
  errors: {
    unauthorized: 'Azure DevOps rejected the account. Reconnect it in Settings → Accounts.',
    permissionDenied: 'Mjolnir did not allow the request: {message}',
    timeout: 'Azure DevOps did not respond in time.',
    requestFailed: 'Azure DevOps responded with an error: {message}',
    invalidRequest: 'Invalid request: {message}',
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
