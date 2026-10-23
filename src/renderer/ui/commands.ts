// Commands of the interface (menus, Ctrl+K search, workspace hotbar). Pure: no React.

export type Workspace = 'pack' | 'disegna' | 'prova' | 'effetti' | 'pubblica'

export interface Command {
  /** Stable id, e.g. 'editor:save'. */
  id: string
  label: string
  /** Menu it appears in (File, Modifica…), or none for search-only commands. */
  menu?: string | undefined
  /** Workspace or area shown next to it in the search. */
  area: string
  keys?: string | undefined
  /** False = shown greyed out (with `why` as the reason). */
  enabled?: boolean | undefined
  why?: string | undefined
  run: () => void
}

/** Lower-case, no accents: "Novità" matches "novita". */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * How well `query` matches `text` (higher is better, null = no match): every query word must
 * appear; a word at the start of the label or of one of its words scores more.
 */
export function matchScore(query: string, text: string): number | null {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return 0
  const target = fold(text)
  let score = 0
  for (const word of words) {
    const at = target.indexOf(word)
    if (at < 0) return null
    if (at === 0) score += 3
    else if (/[\s(/_.-]/.test(target[at - 1] ?? '')) score += 2
    else score += 1
  }
  return score
}

/** Commands for the Ctrl+K search: matched on label and area, best first, enabled before disabled. */
export function searchCommands(query: string, commands: readonly Command[], limit = 12): Command[] {
  const ranked: { command: Command; score: number; index: number }[] = []
  commands.forEach((command, index) => {
    const onLabel = matchScore(query, command.label)
    const onBoth = onLabel ?? matchScore(query, `${command.label} ${command.area}`)
    if (onBoth === null) return
    const score = (onLabel === null ? onBoth : onBoth + 1) + (command.enabled === false ? -100 : 0)
    ranked.push({ command, score, index })
  })
  ranked.sort((a, b) => b.score - a.score || a.index - b.index)
  return ranked.slice(0, limit).map((r) => r.command)
}

/** Menu name → its commands, in registration order; menus in the given order, unknown ones last. */
export function groupMenus(
  commands: readonly Command[],
  order: readonly string[]
): [string, Command[]][] {
  const groups = new Map<string, Command[]>()
  for (const name of order) groups.set(name, [])
  for (const command of commands) {
    if (!command.menu) continue
    const list = groups.get(command.menu) ?? []
    list.push(command)
    groups.set(command.menu, list)
  }
  return [...groups].filter(([, list]) => list.length > 0)
}

/** Several commands may share an id (a screen registered twice): the last registration wins. */
export function dedupe(commands: readonly Command[]): Command[] {
  const byId = new Map<string, Command>()
  for (const command of commands) byId.set(command.id, command)
  return [...byId.values()]
}
