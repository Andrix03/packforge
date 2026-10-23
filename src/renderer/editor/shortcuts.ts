// Keyboard shortcuts of the editor, for the help window (data only). The tool entries come from
// TOOLS so the list can't drift from the real bindings.

import { TOOLS } from './tools'
import { tr } from '../../shared/i18n'

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
    title: tr('Strumenti'),
    items: TOOLS.map((tool) => ({
      keys: tool.shortcut,
      label: tool.label,
      ...(tool.pro ? { pro: true } : {})
    }))
  },
  {
    title: tr('Colori e pennello'),
    items: [
      { keys: 'X', label: tr('Scambia primario e secondario') },
      { keys: tr('Alt + clic'), label: tr('Contagocce temporaneo') },
      { keys: '[  ]', label: tr('Pennello più piccolo / più grande') },
      { keys: tr('Maiusc (forme)'), label: tr('Linea dritta, quadrato, cerchio'), pro: true }
    ]
  },
  {
    title: tr('Vista'),
    items: [
      { keys: tr('Rotellina'), label: tr('Zoom sul punto del mouse') },
      { keys: '+  -', label: tr('Zoom avanti / indietro') },
      { keys: '0', label: tr('Adatta alla finestra') },
      { keys: tr('Spazio + trascina'), label: tr('Sposta la vista (anche tasto centrale)') },
      { keys: 'T', label: tr('Bordi continui (texture che si ripete)') },
      { keys: ',  .', label: tr('Frame precedente / successivo (animazioni)') }
    ]
  },
  {
    title: tr('Modifica'),
    items: [
      { keys: 'Ctrl+Z', label: tr('Annulla') },
      { keys: 'Ctrl+Y', label: tr('Ripeti (anche Ctrl+Maiusc+Z)') },
      { keys: 'Ctrl+S', label: tr('Salva nel pack') },
      { keys: '?  F1', label: tr('Questo elenco') }
    ]
  },
  {
    title: tr('Selezione'),
    items: [
      { keys: 'Ctrl+A', label: tr('Seleziona tutto'), pro: true },
      { keys: 'Ctrl+D', label: tr('Deseleziona'), pro: true },
      { keys: 'Ctrl+C  Ctrl+X  Ctrl+V', label: tr('Copia, taglia, incolla'), pro: true },
      { keys: tr('Canc'), label: tr('Cancella i pixel selezionati'), pro: true },
      { keys: tr('Maiusc+H  Maiusc+V'), label: tr('Rifletti orizzontale / verticale'), pro: true },
      { keys: tr('Maiusc+R'), label: tr('Ruota di 90°'), pro: true },
      { keys: tr('Invio'), label: tr('Appoggia il pezzo spostato'), pro: true },
      { keys: 'Esc', label: tr('Annulla lo spostamento / deseleziona'), pro: true }
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
