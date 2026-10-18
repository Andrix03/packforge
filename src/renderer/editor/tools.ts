// Editor tool definitions (data only, shared by the tool panel and the shortcuts).

export type ToolId = 'pencil' | 'eraser' | 'fill' | 'picker'

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
    id: 'picker',
    label: 'Contagocce',
    shortcut: 'I',
    tip: 'Sinistro prende il colore primario, destro il secondario. Con gli altri strumenti tieni premuto Alt.'
  }
]

export function toolByShortcut(key: string): ToolId | null {
  return TOOLS.find((tool) => tool.shortcut.toLowerCase() === key.toLowerCase())?.id ?? null
}
