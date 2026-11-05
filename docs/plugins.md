# Sistema de plugins — diseño

Propuesta para el paso 1 del [roadmap](roadmap.md). Objetivo: instalar funcionalidades a demanda (Azure DevOps, cliente HTTP, GitLab) sin publicar una versión nueva de Mjolnir, sin abrir una puerta trasera a lo que hoy protege el IPC.

Lo único que sigue marcado **A decidir** es dónde se publica el catálogo.

## Principios

1. **La frontera es la misma que hoy.** Un plugin no habla con el proceso main por su cuenta: todo pasa por un broker en main que valida argumentos con zod y verifica permisos, igual que `handle()`.
2. **Sin Node por defecto.** El código de un plugin corre en un contexto web aislado, sin `require`, sin filesystem y sin red directa. Lo que necesite (HTTP, secretos, cuentas, workspace) lo pide a la API del host. Así los permisos se *aplican*, no solo se declaran.
3. **Declarativo donde se pueda.** Lo que main necesita saber sin ejecutar código del plugin (qué remotos matchea un proveedor, qué vistas hay, qué permisos pide) vive en el manifest.
4. **Una API chica y versionada.** Se expone lo que piden los dos primeros plugins (Azure DevOps y cliente HTTP), no `@mjolnir/core` entero.

## Formato del paquete

Un plugin es una carpeta (en desarrollo) o un `.mjp` (zip) con un `mjolnir-plugin.json` en la raíz:

```json
{
  "id": "azure-devops",
  "version": "0.1.0",
  "engines": { "mjolnir": ">=0.2.0", "api": 1 },
  "name": "%name%",
  "description": "%description%",
  "locales": { "es": "locales/es.json", "en": "locales/en.json" },
  "background": "background.js",
  "contributes": {
    "views": [{ "id": "boards", "title": "%boards.title%", "icon": "icons/boards.svg", "entry": "boards.html" }],
    "settings": [{ "id": "general", "title": "%settings.title%", "entry": "settings.html" }],
    "providers": [
      {
        "id": "azure-devops",
        "displayName": "Azure DevOps",
        "remotes": ["dev.azure.com", "ssh.dev.azure.com", "*.visualstudio.com"],
        "auth": { "token": true, "cli": { "command": "az", "args": ["account", "get-access-token", "--resource", "499b84ac-1321-427f-aa17-267ca6975798", "--query", "accessToken", "-o", "tsv"] } },
        "capabilities": ["pulls"]
      }
    ],
    "commands": [{ "id": "open-work-item", "title": "%commands.openWorkItem%" }]
  },
  "permissions": {
    "network": ["https://dev.azure.com", "https://*.visualstudio.com"],
    "workspace": "read"
  }
}
```

- `id`: `[a-z0-9-]+`, único. Es el namespace de todo lo que el plugin guarda.
- `engines.api`: entero. El host declara qué versiones de API soporta; si no está, el plugin no carga y se muestra por qué.
- Strings con `%clave%` se resuelven con los locales del plugin según el idioma de la app (con `es` como fallback, igual que la app).
- El manifest se valida con un schema zod en core; un manifest inválido no se instala.

## Dónde corre cada cosa

```
main (Node)
  PluginRegistry   lee manifests, estado (habilitado, permisos otorgados)
  PluginBroker     recibe llamadas de plugins, valida, chequea permisos, ejecuta
  protocol mjolnir-plugin://<id>/...  sirve los archivos del plugin con su CSP

renderer (ventana de Mjolnir)
  <iframe sandbox src="mjolnir-plugin://azure-devops/boards.html">              cuando se abre la vista
  <iframe sandbox src="mjolnir-plugin://azure-devops/background.html" hidden>   solo cuando hace falta (ver Activación)
```

- **Origen propio por plugin** (`mjolnir-plugin://<id>`), registrado como esquema `standard` + `secure` + `codeCache`. Cada plugin queda aislado de la app y de los demás plugins por same-origin policy.
- **CSP del protocolo**: `default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; frame-src 'none'; form-action 'none'`. El plugin puede leer sus propios archivos (locales, wasm) pero no salir a la red: el fetch va por el host. Esto además resuelve CORS, que el cliente HTTP necesita sí o sí.
- **Navegación bloqueada**: `will-frame-navigate` solo deja que un iframe de plugin navegue dentro de su propio origen. Sin `allow-popups` ni `allow-top-navigation` en el `sandbox`. La CSP no cubre la navegación, así que sin esto un plugin podría filtrar datos con `location = 'https://…?dato'`.
- **Los iframes no pueden usar `window.mjolnir`**: no tienen preload, e `isTrustedSender` ya rechaza frames que no son el top. Eso no cambia.
- **Dos canales**, y el SDK los esconde:
  - *Servicios* (storage, secretos, HTTP, cuentas): un `MessagePort` directo a main (`MessageChannelMain`). Main sabe qué plugin es el dueño de cada puerto; el plugin no puede hacerse pasar por otro. No pasa por el hilo de React del renderer.
  - *Shell* (contexto, notificaciones, abrir vistas): `postMessage` con la ventana de Mjolnir, que valida `event.source` contra el iframe montado y nunca confía en un id que diga el mensaje.

### Activación

Un plugin instalado no ejecuta nada hasta que se lo necesita:

- Lo que se muestra sin ejecutar código sale del manifest: nombre, ítems del rail, secciones de ajustes, proveedores y los remotos que matchean.
- Una vista se monta al abrirla. Las últimas 3 vistas usadas quedan montadas (ocultas) para volver al instante, y las demás se desmontan.
- El background (fase 3) se levanta la primera vez que se usa un proveedor o un comando del plugin y se baja después de un rato sin uso. No hay activación "al iniciar".

### Escala y performance

Pensado para que tener muchos plugins instalados cueste casi nada mientras no se usan:

- **Arranque**: main lee `plugins.json` y los manifests en paralelo. No carga código de plugins ni sus locales enteros; al renderer solo le llegan los strings que el manifest referencia.
- **Memoria**: cada origen de plugin puede correr en su propio proceso de renderer (site isolation). Por eso se limita lo montado (LRU de vistas, background bajo demanda) en vez de mantener todo vivo.
- **Llamadas**: un puerto por iframe directo a main; validar con zod cuesta microsegundos frente a la red.
- **Storage**: un archivo por plugin que se lee la primera vez que el plugin lo usa y se escribe con debounce.
- **Red**: `session.fetch` con una partición en memoria por plugin. Usa el stack de red de Chromium (proxy y certificados del sistema, que hacen falta en redes corporativas) y no comparte cookies entre plugins ni con la app.
- **Rail**: los ítems de plugins van debajo de los built-in y el rail scrollea. Con muchos plugins hace falta poder fijar o desfijar vistas; queda para la fase 4.

### Código con Node

**No en v1** (decidido). Ninguno de los dos primeros plugins lo necesita: Azure DevOps es HTTP + token, el cliente HTTP es HTTP + archivos del repo, y el único CLI (`az`) se declara en el manifest y lo ejecuta el host (como hoy `gh auth token`).

Si más adelante hace falta, el camino es un `main` opcional en `utilityProcess` con un permiso `node` que avise claramente "acceso completo a tu máquina". Los permisos de Mjolnir no pueden limitar Node, así que ahí la seguridad depende solo de confiar en quien publica.

## Puntos de contribución

| Contribución | Qué hace el host | Qué hace el plugin |
| --- | --- | --- |
| `views` | Ítem en el rail (reemplaza el botón de Plugins deshabilitado), monta el iframe en el área principal y le pasa contexto: repo, sesión, tema, idioma | Renderiza la vista |
| `settings` | Sección en Ajustes con un iframe | Formulario propio, guarda en su storage |
| `providers` | Matchea remotos con `remotes` (sin ejecutar código), arma la cuenta con la UI existente (token / CLI declarado), guarda el secreto con `safeStorage` | Implementa `identify` y `PullRequestProvider` en el background |
| `commands` | Los lista (paleta de comandos a futuro, acciones en la sesión) | Ejecuta el handler |

**Proveedores**: `main/providers.ts` pasa de una lista fija a un registro. Los built-in (GitHub) siguen igual; los de plugins se registran con un `PluginProviderAdapter` que implementa `PullRequestProvider` reenviando cada llamada al background del plugin, con timeout y respuestas validadas contra los schemas de los tipos de PR. Para la vista de PRs no hay diferencia entre un proveedor built-in y uno de plugin.

## API del host (v1)

La exporta `@mjolnir/plugin-sdk` como cliente tipado sobre el `MessagePort`:

```ts
interface HostApi {
  context: { get(): PluginContext; onChange(cb): Unsubscribe }   // locale y tema; sesión activa con workspace o repoFiles
  storage: { get(key); set(key, value); delete(key); keys() }    // JSON por plugin, en <userData>/plugin-data/<id>/storage.json
  secrets: { get(key); set(key, value); delete(key) }            // safeStorage, namespaced por plugin
  http: { request(req: HttpRequest): Promise<HttpResponse> }     // desde main, sujeto a permissions.network
  accounts: { token(provider, host): Promise<string | null> }    // solo de los proveedores que el plugin declara
  workspace: { repos(); worktrees(repoId); branches(repoId) }    // permissions.workspace = "read"
  repoFiles: { list(session, dir); read(session, path); write(session, path, text); delete(session, path) }  // dentro de permissions.repoFiles
  ui: { notify(message, kind); openExternal(url); openView(viewId, params) }
}
```

- Cada método tiene su schema zod en main. Lo que no pasa el schema o el chequeo de permiso devuelve un `AppError` con código (`pluginPermissionDenied`, `invalidRequest`…), que el SDK expone tal cual.
- `http.request` devuelve status, headers y body (texto o base64) más timings, que es lo que necesita el cliente HTTP para mostrar la respuesta.
- `repoFiles` existe por las colecciones por repo del cliente HTTP (por ejemplo `.mjolnir/http/**`). `session` es la que llega en el contexto (`repoId` + `worktree`); main verifica que el worktree exista en ese repo. Los paths son relativos, con `/`, y se validan en el SDK (`isSafeRepoPath`): nunca `.git` ni los nombres que Windows resuelve a `.git` (punto o espacio final, nombres cortos 8.3), porque escribir ahí es ejecutar código vía hooks. Main no sigue symlinks, escribe de forma atómica y limita el tamaño (5 MB por archivo, 5000 archivos por listado). `list` solo recorre las carpetas que pueden contener algo que matchee los globs: con `.mjolnir/http/**` no entra a `node_modules`.
- Implementado hasta ahora (fase 2): `context`, `storage`, `secrets`, `http`, `repoFiles` y `ui.notify` / `ui.openExternal`. `accounts`, `workspace.*` y `ui.openView` llegan con las fases que los usan.

**Versionado**: los tipos que cruzan la frontera (`RemoteRepo`, `PullRequest*`, `Account`) pasan a vivir en el SDK y core los reexporta. Cambiarlos de forma incompatible es subir `api` a 2; el host puede soportar 1 y 2 a la vez durante una transición.

## Permisos

| Permiso | Valor | Se muestra como |
| --- | --- | --- |
| `network` | lista de orígenes, con comodín de subdominio; `["*"]` para todo | "Conectarse a dev.azure.com…" / "Conectarse a cualquier sitio" (resaltado) |
| `workspace` | `"read"` | "Ver el repo y la sesión activos" (y más adelante la lista de repos y branches) |
| `repoFiles` | lista de globs relativos al repo | "Leer y escribir `.mjolnir/http/**` en tus repos" |
| `accounts` | ids de proveedores de otros plugins o built-in | "Usar tu cuenta de GitHub" |

Siempre otorgados, sin preguntar: su propio storage, sus secretos, los tokens de sus propios proveedores, notificaciones y abrir links externos (pasa por `openExternal`, que ya filtra protocolos).

- Se aprueban **al instalar**, con la lista de arriba. Una actualización que agrega permisos queda pendiente hasta que el usuario la acepta; mientras tanto sigue corriendo la versión anterior.
- Se pueden revocar desde la vista de Plugins (deshabilita el plugin).
- Terminales (abrir una pestaña con un comando) queda fuera de v1: es ejecución de comandos arbitrarios con otro nombre.

## Instalación y distribución

```
<userData>/plugins/<id>/<version>/   archivos del plugin
<userData>/plugins.json              id → versión activa, habilitado, permisos otorgados, origen, sha256
<userData>/plugin-data/<id>/         storage.json y secrets.json del plugin
```

- **v1 — archivo local**: "Instalar desde archivo…" con un `.mjp`. Se calcula el sha256, se descomprime validando paths (sin `..`, sin symlinks, tamaño máximo) y se valida el manifest. Se marca como "no verificado".
- **v1 — modo desarrollo**: "Cargar carpeta…" apunta a una carpeta con el plugin sin empaquetar y recarga los iframes cuando cambian los archivos. Es como se desarrollan los plugins first-party.
- **Después — catálogo**: un `index.json` (id, versión, URL del `.mjp`, sha256, firma) en un repo público. Firma ed25519; la clave pública de Mjolnir viene en la app y los plugins first-party van firmados. Los updates se ofrecen desde ahí.

### Plugins first-party

Decidido: viven en el monorepo (`plugins/http-client`, `plugins/azure-devops`) y se **instalan aparte**, no vienen con la app. Fuerza a que la API alcance de verdad y mantiene el instalador chico. La alternativa (bundleados pero desactivables) es más cómoda para colegas, pero esconde los huecos de la API.

**Cliente HTTP** (`plugins/http-client`): cada request de la colección es un archivo en `.mjolnir/http/<carpeta>/<nombre>.json` del repo, para que se versione y se revise en PRs:

```json
{
  "method": "POST",
  "url": "{{base}}/users",
  "headers": [{ "name": "Authorization", "value": "Bearer {{token}}" }],
  "body": { "kind": "json", "text": "{\"name\":\"Ada\"}" }
}
```

Los entornos (`{{variable}}`), el historial (últimos 50) y el borrador quedan en el storage del plugin, en la máquina y no en el repo, porque suelen tener tokens. Pide `network: ["*"]` y `repoFiles: [".mjolnir/http/**"]`.

### A decidir: dónde se publica

El repo es privado, así que los releases no se pueden bajar sin acceso. El catálogo necesita un lugar público (repo de releases aparte o el mismo repo en público). Es la misma decisión que está abierta para los instaladores de la app; conviene tomarlas juntas.

## UI de los plugins

- El host le manda al iframe los valores de los tokens del tema (`THEME_TOKENS` del SDK: colores, tipografía, radios, sombras) leídos de `index.css`, y el SDK los aplica como variables CSS en el iframe. La fuente de verdad sigue siendo `index.css`, sin copia, y un cambio de tema llega solo. `@mjolnir/plugin-sdk/base.css` aplica fondo, tipografía y scrollbars con esas variables, así un plugin se ve nativo sin hacer nada.
- `@mjolnir/plugin-sdk/react` (opcional, React como peer dependency) trae `MjolnirProvider`, `useMjolnir`, `useHostContext` y los componentes básicos de `ui/` (`Button`, `IconButton`, `TextInput`, `TextArea`, `Select`, `Field`, `Badge`, `Segmented`, `EmptyState`), con sus estilos en `@mjolnir/plugin-sdk/components.css` sobre las mismas variables del tema, sin Tailwind. Cada plugin bundlea su propio React; con iframes no hay forma de compartir la instancia y tampoco hace falta.
- El host le pasa al iframe el tamaño disponible; el plugin no controla nada fuera de su área.

### Framework de UI

Decidido: no exigir React, pero que el template de plugin y los first-party lo usen con los componentes del SDK. Exigirlo no aporta nada técnico con iframes y cierra la puerta a plugins chicos en HTML plano.

## Desarrollar un plugin

`plugins/hello` es el ejemplo mínimo: usa storage, secretos, HTTP, notificaciones y sus propios locales, sin framework. `plugins/http-client` es el ejemplo con React y los componentes del SDK.

```sh
pnpm --filter @mjolnir/plugin-hello dev   # vite build --watch → plugins/hello/dist
```

En Mjolnir: **Plugins → Cargar carpeta…** y elegir `plugins/hello/dist` (la carpeta que tiene `mjolnir-plugin.json`). Queda deshabilitado; al habilitarlo pide aprobar los permisos. Mientras está cargado, cada cambio en la carpeta recarga sus vistas.

En una vista, `connect()` del SDK espera el puerto y aplica tema e idioma:

```ts
import { connect } from '@mjolnir/plugin-sdk'
import '@mjolnir/plugin-sdk/base.css'

const mjolnir = await connect()
await mjolnir.storage.set('count', 1)
const response = await mjolnir.http.request({ method: 'GET', url: 'https://api.github.com/zen' })
```

Los errores del host llegan como `HostError` con `code` (`permissionDenied`, `quotaExceeded`, `timeout`, `requestFailed`, `unavailable`…).

## Plan de implementación

Cada fase es un PR con CI verde.

1. **Base** ✅ — `packages/plugin-sdk` (tipos, schema del manifest, cliente, tokens del tema, base.css), `PluginRegistry` cargando carpetas en modo desarrollo con recarga al cambiar archivos, protocolo `mjolnir-plugin://`, broker con `storage`, `secrets`, `http` y `ui`, aprobación de permisos, vista de Plugins en el rail (listar, habilitar, deshabilitar, cargar carpeta, quitar) y contribución `views`. Plugin de ejemplo en `plugins/hello` que usa toda la API y sirve de template.
2. **Cliente HTTP** ✅ — `plugins/http-client` (request, respuesta, historial, entornos) más `repoFiles` y `context` para las colecciones por repo. Valida la API de UI y de red. **∥** con la fase 3 una vez mergeada la 1.
3. **Proveedores** — registro de proveedores, `PluginProviderAdapter`, auth por CLI declarado, permiso `accounts`. Prueba con `plugins/azure-devops` (cuenta + PRs).
4. **Instalación** — `.mjp`, instalación desde archivo, aprobación de permisos, actualizaciones con permisos nuevos.
5. **Catálogo y firma** — cuando esté decidido dónde se publica.

Boards (user stories) entra como vista del plugin de Azure DevOps después de la fase 3; no necesita nada nuevo del host.
