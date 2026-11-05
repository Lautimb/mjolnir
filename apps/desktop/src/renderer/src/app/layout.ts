export const LAYOUTS = {
  left: "grid-cols-[var(--spacing-rail)_var(--spacing-sidebar)_minmax(0,1fr)] [grid-template-areas:'title_title_title'_'rail_sidebar_main'_'rail_status_status']",
  right: "grid-cols-[minmax(0,1fr)_var(--spacing-sidebar)_var(--spacing-rail)] [grid-template-areas:'title_title_title'_'main_sidebar_rail'_'status_status_rail']",
}

export const MAIN_AREA = 'min-h-0 min-w-0 bg-canvas [grid-area:main]'

export const MAIN_COLUMN = `${MAIN_AREA} flex flex-col`

export const TOOLBAR = 'flex h-tabbar flex-none items-center gap-3 border-b border-line bg-surface px-3 text-sm'
