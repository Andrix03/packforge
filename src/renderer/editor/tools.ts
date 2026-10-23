import { tr } from '../../shared/i18n'
// Editor tool definitions (data only, shared by the tool panel and the shortcuts).

export type ToolId =
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'picker'
  | 'shade'
  | 'noise'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'select'
  | 'wand'
  | 'move'

/** Tools that paint with the square brush (size applies). */
export const BRUSH_TOOLS: ReadonlySet<ToolId> = new Set([
  'pencil',
  'eraser',
  'shade',
  'line',
  'rect',
  'ellipse'
])

/** Shape tools: drag from one corner (or end) to the other. */
export const SHAPE_TOOLS: ReadonlySet<ToolId> = new Set(['line', 'rect', 'ellipse'])

/** Tools that work on the selection instead of painting. */
export const SELECTION_TOOLS: ReadonlySet<ToolId> = new Set(['select', 'wand', 'move'])

/** Tools whose strokes can be mirrored. */
export const MIRROR_TOOLS: ReadonlySet<ToolId> = new Set([
  'pencil',
  'eraser',
  'shade',
  'line',
  'rect',
  'ellipse'
])

export const MAX_BRUSH_SIZE = 8
/** Beginners get small brushes: pixel art is drawn pixel by pixel. */
export const BEGINNER_MAX_BRUSH_SIZE = 3

export function maxBrushSize(pro: boolean): number {
  return pro ? MAX_BRUSH_SIZE : BEGINNER_MAX_BRUSH_SIZE
}

export interface ToolInfo {
  id: ToolId
  label: string
  shortcut: string
  /** One-line advice shown under the tools (Italian UI). */
  tip: string
  /** Shown (and its shortcut active) only in Pro mode. */
  pro?: boolean
}

export const TOOLS: readonly ToolInfo[] = [
  {
    id: 'pencil',
    label: tr('Matita'),
    shortcut: 'B',
    tip: tr(
      'Sinistro = colore primario, destro = secondario. Ogni pixel deve avere uno scopo: niente sfumature morbide.'
    )
  },
  {
    id: 'eraser',
    label: tr('Gomma'),
    shortcut: 'E',
    tip: tr(
      'Rende i pixel trasparenti. Sui blocchi pieni (pietra, terra) di solito non serve: usala per foglie, vetro, fiori.'
    )
  },
  {
    id: 'fill',
    label: tr('Secchiello'),
    shortcut: 'G',
    tip: tr(
      'Riempie l’area dello stesso colore. "Globale" cambia quel colore in tutta la texture: utile per ricolorare.'
    )
  },
  {
    id: 'shade',
    label: tr('Ombra'),
    shortcut: 'S',
    tip: tr(
      'Sinistro scurisce, destro schiarisce, di un passo lungo la rampa. Funziona solo sui colori della rampa.'
    )
  },
  {
    id: 'noise',
    label: tr('Rumore'),
    shortcut: 'N',
    tip: tr(
      'Riempie l’area con tonalità casuali della rampa: la base per pietra, terra e ghiaia. Poi ritocca a mano.'
    )
  },
  {
    id: 'picker',
    label: tr('Contagocce'),
    shortcut: 'I',
    tip: tr(
      'Sinistro prende il colore primario, destro il secondario. Con gli altri strumenti tieni premuto Alt.'
    )
  },
  {
    id: 'line',
    label: tr('Linea'),
    shortcut: 'L',
    tip: tr(
      'Trascina da un punto all’altro. Con Maiusc la linea resta orizzontale, verticale o a 45°.'
    ),
    pro: true
  },
  {
    id: 'rect',
    label: tr('Rettangolo'),
    shortcut: 'U',
    tip: tr('Trascina da un angolo all’altro. Maiusc = quadrato. "Pieno" lo riempie.'),
    pro: true
  },
  {
    id: 'ellipse',
    label: tr('Ellisse'),
    shortcut: 'O',
    tip: tr('Trascina il riquadro che contiene l’ellisse. Maiusc = cerchio. "Pieno" la riempie.'),
    pro: true
  },
  {
    id: 'select',
    label: tr('Selezione'),
    shortcut: 'M',
    tip: tr(
      'Trascina un rettangolo. Poi: Ctrl+C/X/V, Canc, Maiusc+H/V rifletti, Maiusc+R ruota. Esc deseleziona.'
    ),
    pro: true
  },
  {
    id: 'wand',
    label: tr('Bacchetta'),
    shortcut: 'W',
    tip: tr(
      'Seleziona i pixel dello stesso colore (Area o Globale). Utile per ricolorare o spostare un dettaglio.'
    ),
    pro: true
  },
  {
    id: 'move',
    label: tr('Sposta'),
    shortcut: 'V',
    tip: tr(
      'Trascina la selezione (o tutto il livello). Invio la appoggia, Esc annulla lo spostamento.'
    ),
    pro: true
  }
]

export function visibleTools(pro: boolean): ToolInfo[] {
  return TOOLS.filter((tool) => pro || !tool.pro)
}

export function toolByShortcut(key: string, pro = true): ToolId | null {
  return (
    visibleTools(pro).find((tool) => tool.shortcut.toLowerCase() === key.toLowerCase())?.id ?? null
  )
}
