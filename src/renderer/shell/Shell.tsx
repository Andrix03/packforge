// The window frame of the 12b interface: menu bar with the Ctrl+K command search, the workspace
// hotbar (Pack / Disegna / Prova / Effetti / Pubblica) and the status bar. Screens go inside.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { groupMenus, searchCommands, type Command, type Workspace } from '../ui/commands'
import { PixelIcon } from '../ui/components'
import { NAV_ICONS } from '../ui/icons'
import { useCommandList, useCommandStore } from './commandContext'
import './shell.css'
import { tr } from '../../shared/i18n'

const MENU_ORDER = [
  'File',
  'Modifica',
  'Immagine',
  'Livelli',
  'Seleziona',
  'Mappe PBR',
  'Pack',
  'Visualizza',
  'Aiuto'
]

/** Menu and area names are Italian keys (commands group by them): shown translated. */
const NAMES: Readonly<Record<string, string>> = {
  File: tr('File'),
  Modifica: tr('Modifica'),
  Immagine: tr('Immagine'),
  Livelli: tr('Livelli'),
  Seleziona: tr('Seleziona'),
  'Mappe PBR': tr('Mappe PBR'),
  Pack: tr('Pack'),
  Visualizza: tr('Visualizza'),
  Aiuto: tr('Aiuto'),
  Disegna: tr('Disegna'),
  Effetti: tr('Effetti'),
  Prova: tr('Prova'),
  Pubblica: tr('Pubblica'),
  PackForge: 'PackForge'
}
const nameOf = (key: string): string => NAMES[key] ?? key

export interface WorkspaceTab {
  id: Workspace
  enabled: boolean
  /** Why it is disabled (tooltip). */
  why?: string | undefined
}

const TABS: { id: Workspace; label: string; icon: keyof typeof NAV_ICONS }[] = [
  { id: 'pack', label: tr('Pack'), icon: 'chest' },
  { id: 'disegna', label: tr('Disegna'), icon: 'pencil' },
  { id: 'prova', label: tr('Prova'), icon: 'cube' },
  { id: 'effetti', label: tr('Effetti'), icon: 'spark' },
  { id: 'pubblica', label: tr('Pubblica'), icon: 'upload' }
]

export function Shell({
  title,
  subtitle,
  workspace,
  tabs,
  onWorkspace,
  right,
  status,
  children
}: {
  title: string
  subtitle: string
  /** The active workspace, or null on the start screen. */
  workspace: Workspace | null
  tabs: readonly WorkspaceTab[]
  onWorkspace: (id: Workspace) => void
  /** Buttons at the right of the hotbar. */
  right?: ReactNode
  status: { left: ReactNode; right: ReactNode }
  children: ReactNode
}) {
  const [searching, setSearching] = useState(false)

  // Ctrl+K anywhere opens the command search.
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearching(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    // The screen comes first in the DOM (its buttons are found first by text, e.g. UI tests); CSS
    // order puts the menu bar and the hotbar back on top.
    <div className="shell">
      <div className="shell-body">{children}</div>
      <MenuBar onSearch={() => setSearching(true)} />
      <div className="shell-hotbar">
        <div className="shell-pack">
          <strong>{title}</strong>
          <span className="muted">{subtitle}</span>
        </div>
        <nav className="shell-tabs" aria-label={tr('Spazi di lavoro')}>
          {TABS.map((tab) => {
            const state = tabs.find((t) => t.id === tab.id)
            const active = workspace === tab.id
            const enabled = state?.enabled ?? false
            return (
              <button
                key={tab.id}
                type="button"
                className={active ? 'shell-tab active' : 'shell-tab'}
                aria-current={active ? 'page' : undefined}
                disabled={!enabled && !active}
                title={!enabled && !active ? state?.why : undefined}
                data-workspace={tab.id}
                onClick={() => onWorkspace(tab.id)}
              >
                <PixelIcon icon={NAV_ICONS[tab.icon]} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="shell-right">{right}</div>
      </div>
      <footer className="shell-status">
        <span className="shell-status-left">{status.left}</span>
        <span className="shell-status-right">{status.right}</span>
      </footer>
      {searching && <CommandSearch onClose={() => setSearching(false)} />}
    </div>
  )
}

function MenuBar({ onSearch }: { onSearch: () => void }) {
  const commands = useCommandList()
  const store = useCommandStore()
  const [open, setOpen] = useState<string | null>(null)
  const bar = useRef<HTMLDivElement>(null)
  const menus = groupMenus(commands, MENU_ORDER)

  // Click outside or Escape closes the open menu.
  useEffect(() => {
    if (open === null) return
    function onDown(event: PointerEvent): void {
      if (!bar.current?.contains(event.target as Node)) setOpen(null)
    }
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(null)
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  function run(command: Command): void {
    setOpen(null)
    store.run(command.id)
  }

  return (
    <div className="shell-menubar" ref={bar}>
      <span className="shell-logo">
        <PixelIcon icon={NAV_ICONS.logo} />
        <span>{tr('PackForge')}</span>
      </span>
      <div className="shell-menus" role="menubar">
        {menus.map(([name, list]) => (
          <div key={name} className="shell-menu">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open === name}
              className={open === name ? 'shell-menu-button open' : 'shell-menu-button'}
              onClick={() => setOpen(open === name ? null : name)}
              onPointerEnter={() => open !== null && open !== name && setOpen(name)}
            >
              {nameOf(name)}
            </button>
            {open === name && (
              <div className="shell-dropdown raised" role="menu" aria-label={nameOf(name)}>
                {list.map((command) => (
                  <button
                    key={command.id}
                    type="button"
                    role="menuitem"
                    className="shell-item"
                    disabled={command.enabled === false}
                    title={command.enabled === false ? command.why : undefined}
                    onClick={() => run(command)}
                  >
                    <span>{command.label}</span>
                    {command.keys && <span className="mk">{command.keys}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="shell-search sunken"
        onClick={onSearch}
        aria-label={tr('Cerca un comando (Ctrl+K)')}
      >
        <PixelIcon icon={NAV_ICONS.search} />
        <span className="muted">{tr('Cerca un comando')}</span>
        <span className="mk">{tr('Ctrl K')}</span>
      </button>
    </div>
  )
}

function CommandSearch({ onClose }: { onClose: () => void }) {
  const commands = useCommandList()
  const store = useCommandStore()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(0)
  const results = searchCommands(query, commands)
  const current = Math.min(picked, Math.max(0, results.length - 1))

  function run(command: Command | undefined): void {
    if (!command || command.enabled === false) return
    onClose()
    store.run(command.id)
  }

  return (
    <div
      className="shell-search-backdrop"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shell-search-box raised" role="dialog" aria-label={tr('Cerca un comando')}>
        <input
          className="ui-field"
          autoFocus
          value={query}
          placeholder={tr('Scrivi cosa vuoi fare…')}
          aria-label={tr('Comando da cercare')}
          onChange={(e) => {
            setQuery(e.target.value)
            setPicked(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              onClose()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setPicked(Math.min(current + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setPicked(Math.max(current - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(results[current])
            }
          }}
        />
        <div className="shell-results" role="listbox" aria-label={tr('Comandi')}>
          {results.length === 0 && (
            <span className="muted">{tr('Nessun comando con queste parole.')}</span>
          )}
          {results.map((command, index) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === current}
              className={index === current ? 'shell-result active' : 'shell-result'}
              disabled={command.enabled === false}
              title={command.enabled === false ? command.why : undefined}
              onPointerEnter={() => setPicked(index)}
              onClick={() => run(command)}
            >
              <span>{command.label}</span>
              <span className="muted">{nameOf(command.area)}</span>
              {command.keys && <span className="mk">{command.keys}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
