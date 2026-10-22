// Palette files (Phase 19 logic): import and export of the formats pixel artists share —
// GIMP/Aseprite/Krita `.gpl`, Lospec `.hex` (one RRGGBB per line) and Paint.NET `.txt`
// (AARRGGBB lines, `;` comments). Colors are PackForge's `#rrggbbaa` strings. Pure.

import { MAX_PALETTE_COLORS, type SavedPalette } from './settings'

export type PaletteFormat = 'gpl' | 'hex' | 'txt'

export type PaletteImport =
  { ok: true; palette: SavedPalette; skipped: number } | { ok: false; error: string }

/** Reads a palette file; `fileName` names it when the file has no name of its own. */
export function importPalette(text: string, fileName: string): PaletteImport {
  // A byte order mark (U+FEFF) some editors put at the start.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const lines = body.split(/\r?\n/)
  const fallbackName = fileName.replace(/\.[^.]+$/, '').slice(0, 40) || 'Palette'
  let name = fallbackName
  const colors: string[] = []
  let skipped = 0
  const push = (color: string): void => {
    if (colors.includes(color)) return
    if (colors.length < MAX_PALETTE_COLORS) colors.push(color)
    else skipped++
  }
  if (lines[0]?.trim() === 'GIMP Palette') {
    for (const line of lines.slice(1)) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) continue
      const named = /^Name:\s*(.+)$/i.exec(trimmed)
      if (named) {
        name = named[1]!.trim().slice(0, 40) || fallbackName
        continue
      }
      if (/^Columns:/i.test(trimmed)) continue
      const rgb = /^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})/.exec(trimmed)
      if (!rgb || rgb.slice(1).some((v) => Number(v) > 255)) {
        skipped++
        continue
      }
      push(
        `#${rgb
          .slice(1, 4)
          .map((v) => hex2(Number(v)))
          .join('')}ff`
      )
    }
  } else {
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith(';')) continue
      const value = trimmed.replace(/^#/, '').toLowerCase()
      if (/^[0-9a-f]{6}$/.test(value)) push(`#${value}ff`)
      // Paint.NET writes alpha first.
      else if (/^[0-9a-f]{8}$/.test(value)) push(`#${value.slice(2)}${value.slice(0, 2)}`)
      else skipped++
    }
  }
  if (colors.length === 0) return { ok: false, error: 'Nel file non ci sono colori leggibili.' }
  return { ok: true, palette: { name, colors }, skipped }
}

/** A palette as a file of `format` (transparency only survives in `.txt`). */
export function exportPalette(palette: SavedPalette, format: PaletteFormat): string {
  const rgb = palette.colors.map((c) => c.slice(1, 7))
  if (format === 'hex') return `${rgb.join('\n')}\n`
  if (format === 'txt') {
    const argb = palette.colors.map((c) => `${c.slice(7, 9)}${c.slice(1, 7)}`.toUpperCase())
    return `; paint.net Palette File\n; ${palette.name}\n${argb.join('\n')}\n`
  }
  const rows = rgb.map((h) => {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
    return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${h}`
  })
  return `GIMP Palette\nName: ${palette.name}\nColumns: 8\n#\n${rows.join('\n')}\n`
}

function hex2(value: number): string {
  return value.toString(16).padStart(2, '0')
}
