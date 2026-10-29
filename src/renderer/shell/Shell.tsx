// The window frame of the v3 interface: menu bar with the Ctrl+K command search, the hotbar of the
// nine sections (keys 1-9, like the game's) and the status bar. Screens go inside.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SECTION_IDS, type SectionId } from '../../shared/sections'
import { groupMenus, searchCommands, type Command } from '../ui/commands'
import { PixelIcon } from '../ui/components'
import { NAV_ICONS } from '../ui/icons'
import { SECTION_ICONS } from '../ui/sectionIcons'
import { sectionName } from './sectionNames'
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

/** What each slot is for (its tooltip). */
const SLOT_TIPS: Readonly<Record<SectionId, string>> = {
  pack: tr('Il pack: descrizione, versioni, tutti i file, strumenti per tutto il pack'),
  blocks: tr('Texture e modelli dei blocchi'),
  items: tr('Oggetti: texture, 3D in mano, definizioni'),
  armor: tr('Armature e finiture sul giocatore 3D'),
  entities: tr('Mob e altre entità, varianti casuali'),
  gui: tr('Pulsanti, inventari, HUD'),
  screens: tr('Titolo, panorama e schermata di caricamento'),
  world: tr('Colori dei biomi, cielo, particelle'),
  texts: tr('Nomi, messaggi e frasi del gioco')
}

export function Shell({
  title,
  subtitle,
  section,
  sectionsEnabled,
  keysEnabled,
  onSection,
  right,
  status,
  children
}: {
  title: string
  subtitle: string
  /** The section shown, or null when none is (start screen, Pubblica). */
  section: SectionId | null
  /** False until a pack is open. */
  sectionsEnabled: boolean
  /** Keys 1-9 switch section (off while the editor or a field has the keyboard). */
  keysEnabled: boolean
  onSection: (id: SectionId) => void
  /** Buttons at the right of the hotbar. */
  right?: ReactNode
  status: { left: ReactNode; right: ReactNode }
  children: ReactNode
}) {
  const [searching, setSearching] = useState(false)

  // Keys 1-9 pick a section, like the game's hotbar, unless typing or a dialog is open.
  useEffect(() => {
    if (!sectionsEnabled || !keysEnabled) return
    function onKey(event: KeyboardEvent): void {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
      const index = Number(event.key) - 1
      const id = SECTION_IDS[index]
      if (!id || !/^[1-9]$/.test(event.key)) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (document.querySelector('[role=dialog]')) return
      event.preventDefault()
      onSection(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sectionsEnabled, keysEnabled, onSection])

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
        <nav className="shell-tabs shell-slots" aria-label={tr('Sezioni')}>
          {SECTION_IDS.map((id, index) => {
            const active = section === id
            return (
              <button
                key={id}
                type="button"
                className={active ? 'shell-tab shell-slot active' : 'shell-tab shell-slot'}
                aria-current={active ? 'page' : undefined}
                aria-keyshortcuts={String(index + 1)}
                disabled={!sectionsEnabled}
                title={sectionsEnabled ? SLOT_TIPS[id] : tr('Apri o crea un pack')}
                data-section={id}
                onClick={() => onSection(id)}
              >
                <span className="shell-slot-key" aria-hidden="true">
                  {index + 1}
                </span>
                <PixelIcon icon={SECTION_ICONS[id]} size={32} />
                <span>{sectionName(id)}</span>
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
