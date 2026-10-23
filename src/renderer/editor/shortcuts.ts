// Keyboard shortcuts of the editor, for the help window (data only). The tool entries come from
// TOOLS so the list can't drift from the real bindings.

import { TOOLS } from './tools'

export interface Shortcut {
  keys: string
  label: string
  /** Only in Pro mode. */
  pro?: boolean
}

export interface ShortcutGroup {
  title: string
  items: Shortcut[]
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Strumenti',
    items: TOOLS.map((tool) => ({
      keys: tool.shortcut,
      label: tool.label,
      ...(tool.pro ? { pro: true } : {})
    }))
  },
  {
    title: 'Colori e pennello',
    items: [
      { keys: 'X', label: 'Scambia primario e secondario' },
      { keys: 'Alt + clic', label: 'Contagocce temporaneo' },
      { keys: '[  ]', label: 'Pennello più piccolo / più grande' },
      { keys: 'Maiusc (forme)', label: 'Linea dritta, quadrato, cerchio', pro: true }
    ]
  },
  {
    title: 'Vista',
    items: [
      { keys: 'Rotellina', label: 'Zoom sul punto del mouse' },
      { keys: '+  -', label: 'Zoom avanti / indietro' },
      { keys: '0', label: 'Adatta alla finestra' },
      { keys: 'Spazio + trascina', label: 'Sposta la vista (anche tasto centrale)' },
      { keys: 'T', label: 'Bordi continui (texture che si ripete)' },
      { keys: ',  .', label: 'Frame precedente / successivo (animazioni)' }
    ]
  },
  {
    title: 'Modifica',
    items: [
      { keys: 'Ctrl+Z', label: 'Annulla' },
      { keys: 'Ctrl+Y', label: 'Ripeti (anche Ctrl+Maiusc+Z)' },
      { keys: 'Ctrl+S', label: 'Salva nel pack' },
      { keys: '?  F1', label: 'Questo elenco' }
    ]
  },
  {
    title: 'Selezione',
    items: [
      { keys: 'Ctrl+A', label: 'Seleziona tutto', pro: true },
      { keys: 'Ctrl+D', label: 'Deseleziona', pro: true },
      { keys: 'Ctrl+C  Ctrl+X  Ctrl+V', label: 'Copia, taglia, incolla', pro: true },
      { keys: 'Canc', label: 'Cancella i pixel selezionati', pro: true },
      { keys: 'Maiusc+H  Maiusc+V', label: 'Rifletti orizzontale / verticale', pro: true },
      { keys: 'Maiusc+R', label: 'Ruota di 90°', pro: true },
      { keys: 'Invio', label: 'Appoggia il pezzo spostato', pro: true },
      { keys: 'Esc', label: 'Annulla lo spostamento / deseleziona', pro: true }
    ]
  }
]

/** The groups to show for a mode (empty groups dropped). */
export function shortcutsFor(pro: boolean): ShortcutGroup[] {
  return SHORTCUT_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => pro || !item.pro)
  })).filter((group) => group.items.length > 0)
}
