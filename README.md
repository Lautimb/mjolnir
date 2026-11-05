# Mjolnir

Workspace de escritorio para trabajar con agentes (Claude Code, opencode), terminales de Windows y WSL, worktrees, diffs y PRs en un solo lugar, extensible con plugins.

## Estructura

```
apps/desktop      Electron (main, preload, renderer React)
packages/core     Dominio sin Electron: perfiles de terminal, hosts, git
packages/plugin-sdk  API para plugins (manifest, cliente, permisos, tema)
plugins/          Plugins first-party (ver docs/plugins.md)
```

## Desarrollo

Requisitos: Node 22+, pnpm 10.

En Linux/WSL, `node-pty` se compila al instalar, así que hace falta toolchain:

```sh
sudo apt install -y build-essential
```

En Windows y macOS usa binarios precompilados.

```sh
pnpm install
pnpm dev        # levanta la app con hot reload (main y preload reinician Electron)
pnpm test
pnpm typecheck
```

Desde WSL, `pnpm dev` abre la versión Linux con WSLg.

### Correr la app nativa de Windows con el código en WSL

Requisitos del lado de Windows: Node 22+ (trae `corepack`). En WSL: `rsync`.

```sh
pnpm dev:win      # espeja el repo a %LOCALAPPDATA%\mjolnir-dev y levanta el dev server en Windows
pnpm app:win      # instala la build actual en %LOCALAPPDATA%\Programs\Mjolnir con acceso en el menú Inicio
pnpm package:win  # genera el instalador NSIS en el espejo (apps\desktop\release)
```

`app:win` corre la app con el `electron.exe` oficial porque Smart App Control bloquea ejecutables sin firma. `package:win` funciona en máquinas sin Smart App Control o cuando el ejecutable esté firmado.

## Convenciones

- **Renderer por feature**: `app`, `sessions`, `terminals`, `diff`, `pulls`, `settings`. Lo compartido entre features va a `ui/`.
- **Estilos con Tailwind**: el tema (colores, tipografía, radios, medidas) está en `src/renderer/src/index.css` y es la única fuente de tokens. Un patrón que se repite se vuelve un componente de `ui/`, no una clase global. Para estados, usar ramas excluyentes (`selected ? 'bg-selected' : 'hover:bg-hover'`): dos utilidades de la misma propiedad en un elemento no tienen ganador predecible.
- **IPC**: cada canal se registra en `src/main/ipc/<dominio>.ts` con `handle(canal, [schemas], handler)`. Los argumentos se validan con los schemas de `src/main/schemas.ts` y solo se aceptan mensajes del renderer de la app.

## Idiomas

Los textos de la interfaz viven en `apps/desktop/src/renderer/src/i18n/locales/`. `es.ts` es la fuente de verdad: las claves y los parámetros de `t()` se tipan a partir de ese archivo.

Para agregar un idioma:

1. Sumar su código a `LOCALE_IDS` en `apps/desktop/src/shared/locales.ts`.
2. Crear `locales/<código>.ts` tipado como `Messages` (copiando `en.ts` como base).
3. Registrarlo en `LOCALES` (`i18n/catalog.ts`) con su nombre nativo y su `load()`.

Si falta una clave o un idioma no está registrado, no compila. Los tests verifican además que cada traducción use los mismos `{placeholders}` que el español.
