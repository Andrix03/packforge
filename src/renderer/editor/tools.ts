// Editor tool definitions (data only, shared by the tool panel and the shortcuts).

export type ToolId = 'pencil' | 'eraser' | 'fill' | 'picker' | 'shade' | 'noise'

/** Tools that paint with the square brush (size applies). */
export const BRUSH_TOOLS: ReadonlySet<ToolId> = new Set(['pencil', 'eraser', 'shade'])

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
  }
]

export function toolByShortcut(key: string): ToolId | null {
  return TOOLS.find((tool) => tool.shortcut.toLowerCase() === key.toLowerCase())?.id ?? null
}
