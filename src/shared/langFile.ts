// The game's texts in a pack (`assets/minecraft/lang/<code>.json`, a flat object key → text):
// the pack lists only the lines it changes, the game takes the rest from its own file. Pure.

export interface LangRow {
  key: string
  /** The game's text (null: a key the game doesn't have, e.g. from a mod). */
  vanilla: string | null
  /** The pack's text (null: not changed by the pack). */
  pack: string | null
}

/**
 * Lines matching `query` (in the key, the game's text or the pack's, ignoring case), the pack's
 * own lines first; at most `limit`, with how many matched in all.
 */
export function searchLang(
  vanilla: Readonly<Record<string, string>>,
  pack: Readonly<Record<string, string>>,
  query: string,
  limit = 200
): { rows: LangRow[]; total: number } {
  const q = query.trim().toLowerCase()
  const keys = new Set([...Object.keys(pack), ...Object.keys(vanilla)])
  const matches: LangRow[] = []
  for (const key of keys) {
    const row = { key, vanilla: vanilla[key] ?? null, pack: pack[key] ?? null }
    if (
      q === '' ||
      key.toLowerCase().includes(q) ||
      row.vanilla?.toLowerCase().includes(q) ||
      row.pack?.toLowerCase().includes(q)
    ) {
      matches.push(row)
    }
  }
  matches.sort(
    (a, b) => Number(b.pack !== null) - Number(a.pack !== null) || a.key.localeCompare(b.key)
  )
  return { rows: matches.slice(0, limit), total: matches.length }
}

/**
 * The pack's texts after `edits` (null or the game's own text removes the line: the game's
 * text shows again). Keys sorted, as the vanilla files are.
 */
export function mergeLang(
  pack: Readonly<Record<string, string>>,
  edits: Readonly<Record<string, string | null>>,
  vanilla: Readonly<Record<string, string>> = {}
): Record<string, string> {
  const out: Record<string, string> = { ...pack }
  for (const [key, value] of Object.entries(edits)) {
    if (value === null || value === vanilla[key]) delete out[key]
    else out[key] = value
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
}

/** A lang file's object of texts (anything not a string dropped); null when not JSON. */
export function parseLang(text: string): Record<string, string> | null {
  try {
    const parsed: unknown = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  } catch {
    return null
  }
}
