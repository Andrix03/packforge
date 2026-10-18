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
    label: 'Matita',
    shortcut: 'B',
    tip: 'Sinistro = colore primario, destro = secondario. Ogni pixel deve avere uno scopo: niente sfumature morbide.'
  },
  {
    id: 'eraser',
    label: 'Gomma',
    shortcut: 'E',
    tip: 'Rende i pixel trasparenti. Sui blocchi pieni (pietra, terra) di solito non serve: usala per foglie, vetro, fiori.'
  },
  {
    id: 'fill',
    label: 'Secchiello',
    shortcut: 'G',
    tip: 'Riempie l’area dello stesso colore. "Globale" cambia quel colore in tutta la texture: utile per ricolorare.'
  },
  {
    id: 'shade',
    label: 'Ombra',
    shortcut: 'S',
    tip: 'Sinistro scurisce, destro schiarisce, di un passo lungo la rampa. Funziona solo sui colori della rampa.'
  },
  {
    id: 'noise',
    label: 'Rumore',
    shortcut: 'N',
    tip: 'Riempie l\u2019area con tonalità casuali della rampa: la base per pietra, terra e ghiaia. Poi ritocca a mano.'
  },
  {
    id: 'picker',
    label: 'Contagocce',
    shortcut: 'I',
    tip: 'Sinistro prende il colore primario, destro il secondario. Con gli altri strumenti tieni premuto Alt.'
  },
  {
    id: 'line',
    label: 'Linea',
    shortcut: 'L',
    tip: 'Trascina da un punto all’altro. Con Maiusc la linea resta orizzontale, verticale o a 45°.',
    pro: true
  },
  {
    id: 'rect',
    label: 'Rettangolo',
    shortcut: 'U',
    tip: 'Trascina da un angolo all’altro. Maiusc = quadrato. "Pieno" lo riempie.',
    pro: true
  },
  {
    id: 'ellipse',
    label: 'Ellisse',
    shortcut: 'O',
    tip: 'Trascina il riquadro che contiene l’ellisse. Maiusc = cerchio. "Pieno" la riempie.',
    pro: true
  },
  {
    id: 'select',
    label: 'Selezione',
    shortcut: 'M',
    tip: 'Trascina un rettangolo. Poi: Ctrl+C/X/V, Canc, Maiusc+H/V rifletti, Maiusc+R ruota. Esc deseleziona.',
    pro: true
  },
  {
    id: 'wand',
    label: 'Bacchetta',
    shortcut: 'W',
    tip: 'Seleziona i pixel dello stesso colore (Area o Globale). Utile per ricolorare o spostare un dettaglio.',
    pro: true
  },
  {
    id: 'move',
    label: 'Sposta',
    shortcut: 'V',
    tip: 'Trascina la selezione (o tutto il livello). Invio la appoggia, Esc annulla lo spostamento.',
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
