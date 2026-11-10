# Mjolnir — roadmap y decisiones

Documento vivo para retomar el trabajo desde cualquier worktree o sesión de agente. Si una decisión cambia, se actualiza acá en el mismo PR que la cambia.

## Objetivo

Un workspace de escritorio que centralice el trabajo diario y evite el alt-tab:

- Terminales de Windows y WSL (y shells de macOS/Linux).
- Lanzar agentes (Claude Code, opencode) dentro de cada sesión.
- Git worktrees para correr sesiones/agentes en paralelo sobre el mismo repo.
- Ver el diff de cada sesión.
- Crear, inspeccionar y comentar PRs de cualquier proveedor.
- Plugins instalables a demanda (tableros de Azure Boards, cliente HTTP tipo Postman, etc.).

Primero es para uso propio; después se comparte con colegas como instalador (.exe, .dmg, AppImage/deb) sin necesidad de tener el repo.

## Estado actual (v0.1.0)

Hecho y en `main`:

| Área | Qué hay |
| --- | --- |
| Sesiones | Repos por host (Windows, WSL, posix), descubrimiento de repos, sesiones = worktrees en `~/.mjolnir/worktrees/<repo>/<branch>` del lado del host del repo |
| Terminales | Pestañas por sesión con node-pty, perfiles detectados por plataforma, lanzador de agentes |
| Diff | Vista por sesión (cambios sin commitear o toda la branch contra su base) con Monaco, badge de archivos cambiados. Historial de commits de la sesión (los propios de la branch o todo, paginado) con el diff de cada commit contra su primer padre |
| PRs | GitHub: listar (míos / para revisar / todos × abiertos / cerrados / todos), detalle, comentarios, crear (publica la branch si hace falta), diff del PR |
| Cuentas | Modelo de cuentas por proveedor: CLI (`gh`), token, device flow (pendiente de Client ID). Secretos con `safeStorage` |
| i18n | Español (fuente de verdad) e inglés, tipado, preparado para más idiomas |
| Ajustes | Idioma, posición del panel, cursor de terminal |
| Seguridad | IPC con remitente verificado y argumentos validados con zod, refs y paths validados en core, CSP, navegación y permisos bloqueados, fuses de Electron |
| Distribución | Workflow de release con instaladores para Windows, macOS (arm64/x64) y Linux; CI con typecheck y tests en cada PR |

## Arquitectura

```
apps/desktop          Electron
  src/main            proceso principal: window, environment, security, ipc/<dominio>, schemas
  src/preload         puente tipado (MjolnirApi)
  src/shared          contratos entre main y renderer: api, settings, errors, locales
  src/renderer/src    React por feature: app, sessions, terminals, diff, pulls, settings, ui, i18n
packages/core         dominio sin Electron: hosts, perfiles, git, branches, diff, refs, proveedores
packages/plugin-sdk   API para plugins: manifest, protocolo, cliente, permisos, tema
plugins/              plugins first-party (hello es el ejemplo mínimo, http-client, azure-devops)
docs/                 este documento
```

Decisiones que no se revierten sin discutir:

- **Host como abstracción**: `{kind:'windows'} | {kind:'wsl', distro} | {kind:'posix'}`. Desde Windows, los comandos de WSL corren con `wsl.exe -d <distro> --cd <cwd> --exec <cmd>` (`--exec`, nunca `--`: el shell por defecto reparsea los argumentos).
- **Core puro**: todo lo que no necesita Electron vive en `packages/core` y se testea ahí. `@mjolnir/core/browser` no importa nada de Node.
- **Errores como códigos**: el main lanza `AppError(code, params)` y el renderer los traduce con `describeError`. Nunca se parsean mensajes de git (salen localizados).
- **Proveedores**: `ProviderDefinition` (`matchRemote`) + `PullRequestProvider` en core; el adaptador (auth, CLI, client id) en `main/providers.ts`. Es el punto de extensión que van a usar los plugins.
- **Datos de la app**: `%APPDATA%\Mjolnir` / `~/.config/Mjolnir` con `workspace.json` (repos, settings, bases de sesión) y `accounts.json`.

## Convenciones

- Trabajo en ramas → PR → squash merge. CI tiene que pasar.
- Conventional commits, sin atribución de IA.
- Comentarios en el código: por defecto ninguno; lo que amerite documentarse va a un test.
- Estilos con Tailwind v4; el tema vive en `src/renderer/src/index.css`. Patrones repetidos → componente de `ui/`. Estados con ramas excluyentes, nunca dos utilidades de la misma propiedad compitiendo.
- IPC: `handle(canal, [schemas], handler)` en `src/main/ipc/<dominio>.ts`, schemas en `src/main/schemas.ts`.
- Textos siempre por i18n (`es.ts` primero). Los tests verifican placeholders.
- Escalable, legible y prolijo por sobre rápido: si algo queda hardcodeado o como deuda, se avisa.

## Cómo trabajar en paralelo con worktrees

1. Desde Mjolnir, en el repo `mjolnir`, **Nueva sesión** con una branch por tema (por ejemplo `feat/plugins-host`), base `main`.
2. Abrir un agente en esa sesión y pasarle este documento más la sección del tema.
3. Al terminar: PR desde la vista de PRs, CI verde, squash merge.
4. Las demás sesiones rebasean sobre `main` cuando lo necesiten.

Temas que se pueden trabajar en paralelo sin pisarse están marcados con **∥** abajo.

## Próximos pasos

### 1. Sistema de plugins (en curso)

Objetivo: que quien tenga la app instale funcionalidades a demanda sin actualizar Mjolnir.

Diseño y fases en [`docs/plugins.md`](plugins.md). Hechas: fase 1 (base: SDK, carga desde carpeta, protocolo aislado, broker, vista de Plugins, `plugins/hello`), fase 2 (`plugins/http-client`, `repoFiles`, sesión en el contexto, `@mjolnir/plugin-sdk/react`), fase 3 (proveedores de plugins con background bajo demanda, `plugins/azure-devops`), fase 4 (instalación de `.mjp`, actualizaciones con permisos nuevos, `mjolnir-plugin pack`, fijar vistas en el rail) y fase 5 (catálogo en `Lautimb/mjolnir-plugins`, firma ed25519, instalación y updates desde la app).

Lo que cubre el diseño:

- **Formato del paquete**: manifest (`id`, versión, versión mínima de Mjolnir, contribuciones, permisos) + bundle de main y/o renderer.
- **Puntos de contribución**: proveedores de cuentas/PRs, vistas en el rail, secciones de ajustes, comandos.
- **Aislamiento y permisos**: qué puede tocar un plugin (red, filesystem, terminales, cuentas) y cómo el usuario lo aprueba. El IPC ya valida todo lo que entra; los plugins tienen que pasar por la misma frontera.
- **Distribución**: de dónde se instalan (registro propio, GitHub releases, archivo local), firma/verificación e instalación en el directorio de datos.
- **API estable**: qué parte de `@mjolnir/core` y de `MjolnirApi` se expone y se versiona.

### 2. Azure DevOps como primer plugin

Cuenta, PRs y Boards hechos en `plugins/azure-devops`. Falta probarlo contra una organización real.

- Boards: selector organización → proyecto → equipo → tablero → iteración (actual por defecto), columnas del tablero Kanban con sus cards, filtros "asignados a mí" y búsqueda, branches y PRs linkeados (resalta las cards linkeadas a la branch de la sesión) y mover cards entre columnas arrastrando o con Alt + ← / →. Mover setea el estado y la columna del tablero, con `test` sobre `/rev` para no pisar cambios de otro.
- Tomar una card: panel de detalle con la branch sugerida (`feat/<id>-<título>`, `fix/` para bugs); la asigna, la pasa a la primera columna en curso y abre el formulario de nueva sesión del repo activo con esa branch (`ui.newSession`), donde se elige la base.
- Pendiente en Boards: linkear la branch a la card una vez publicada, swimlanes, la mitad Doing/Done de las columnas partidas (hoy se muestra como badge y mover siempre cae en Doing), más de 200 items por consulta, login con Microsoft.

### 3. Más plugins

- GitLab (cuenta + PRs/MRs). **∥**
- Cliente HTTP: hecho como plugin (`plugins/http-client`). Pendiente: variables secretas en los entornos, importar de Postman/OpenAPI, cancelar un request en curso.

### PRs v2 **∥**

- Comentarios inline en el diff y respuesta a hilos.
- Aprobar, pedir cambios y mergear desde la app (botón de merge).
- Renderizar Markdown en descripción y comentarios (sanitizado).
- Soporte para varios remotos (hoy solo `origin`).
- "Míos" con la API de búsqueda (hoy filtra los últimos 100 PRs).

### Sesiones y terminales **∥**

- Stage y commit desde la UI.
- Persistir terminales/pestañas al reiniciar: hecho. Se guarda qué pestañas tenía cada sesión (tipo, agente, perfil), no su contenido; al volver quedan "dormidas" y se levantan al activarlas. Claude arranca cada pestaña con `--session-id <uuid>` y al despertar retoma esa conversación con `--resume <uuid>`. opencode no deja fijar el id al crear, así que usa `--continue` solo si es la única pestaña de ese agente en la sesión; si hay más, abre una nueva. El Launchpad ofrece Continuar la última / Nueva. Con los hooks de estado, la pestaña sigue el id cuando cambia adentro (`/clear`, `/resume`, `--continue`) y una conversación sin mensajes se abre de nuevo en vez de fallar al retomar.
- Tomar un ticket con un agente: hecho. Cuando un plugin pide una sesión con ticket, el formulario de nueva sesión elige agente (Claude, opencode o ninguno) y muestra un prompt inicial editable, con "Restablecer". La plantilla sale, en orden, de la guardada en la app para ese repo (botón en la fila del repo), de `.mjolnir/prompts/take.md` o de una por defecto, con `{id}`, `{title}`, `{url}`, `{branch}`, `{description}`. El prompt siempre se confirma: la descripción del ticket la escribe cualquiera de la organización. Llega al agente por la variable `MJOLNIR_PROMPT` (nunca por escape de shell): `"$MJOLNIR_PROMPT"` en shells posix y `$env:MJOLNIR_PROMPT` en PowerShell, con `WSLENV` para cruzar a WSL y el valor pre-escapado para Windows PowerShell 5.1. cmd no está soportado.
- Estado de los agentes: hecho para Claude. Se lanza con `--settings "$MJOLNIR_AGENT_SETTINGS"`, que agrega hooks (`SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Notification`, `Stop`, `SessionEnd`) sin tocar la configuración del usuario ni del repo. Cada hook vuelca su payload con `cat > "$MJOLNIR_AGENT_STATUS"` a `<datos de la app>/agent-status/<pestaña>.json`, que el main vigila; la ruta cruza a WSL con `WSLENV` (`/p`). Se muestra en la pestaña y en la sesión del panel (espera tu respuesta > trabajando > terminó), con notificación del sistema si la ventana no tiene foco. cmd no está soportado. Pendiente: opencode (eventos de su sistema de plugins), un ajuste para apagar las notificaciones.
- Agentes configurables desde ajustes (hoy están en `terminals/model.ts`).

### Distribución

- Firma de Windows: sin firma, Smart App Control bloquea el `.exe`. Opciones evaluadas: certificado OV (pago), Artifact Signing de Microsoft (individuos solo EE. UU./Canadá). Por ahora: `pnpm app:win` en la PC propia (usa el `electron.exe` oficial firmado) y el instalador sin firmar en PCs sin Smart App Control.
- macOS: firma ad-hoc; sin Apple Developer hay que usar "Abrir igual" la primera vez.
- El repo es público: los instaladores y los plugins first-party se bajan de sus releases.
- Auto-update (electron-updater ya tiene los `latest*.yml` en el release).
- Probar los instaladores en Linux.

### Pendientes chicos

- `GITHUB_OAUTH_CLIENT_ID` en `apps/desktop/src/main/providers.ts`: registrar una OAuth App con Device Flow para habilitar "Conectar con el navegador".
- Validar `accounts.json` al cargarlo (hoy se confía en el archivo).
- Separar los datos del modo dev de los de la app instalada para que no compartan caché.
- Diff: blame por línea (estilo GitLens) sobre el historial.

## Comandos

```sh
pnpm dev          # app con hot reload (desde WSL abre la versión Linux)
pnpm dev:win      # espeja a Windows y levanta la app nativa con hot reload
pnpm app:win      # instala la build en %LOCALAPPDATA%\Programs\Mjolnir (menú Inicio)
pnpm package:win  # instalador NSIS sin firmar
pnpm test
pnpm typecheck
git tag vX.Y.Z && git push origin vX.Y.Z   # dispara el release
```
