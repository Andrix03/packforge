// Every character the interface can show must exist in the pixel font (Pixel Operator): a missing
// one (✓, →, ▶, an emoji…) falls back to a system font and breaks the pixel style. Symbols are
// drawn as glyphs instead (renderer/ui/glyphs.ts). Lives here because it reads files with node.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')
const FONTS = join(SRC, 'renderer', 'ui', 'fonts')

/** Code points of a TrueType font's format-4 cmap subtable. */
function fontCodePoints(file: string): Set<number> {
  const buf = readFileSync(file)
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let cmap = 0
  for (let i = 0; i < v.getUint16(4); i++) {
    const rec = 12 + i * 16
    if (buf.toString('latin1', rec, rec + 4) === 'cmap') cmap = v.getUint32(rec + 8)
  }
  const out = new Set<number>()
  for (let i = 0; i < v.getUint16(cmap + 2); i++) {
    const off = cmap + v.getUint32(cmap + 8 + i * 8)
    if (v.getUint16(off) !== 4) continue
    const segX2 = v.getUint16(off + 6)
    for (let s = 0; s < segX2 / 2; s++) {
      const end = v.getUint16(off + 14 + s * 2)
      const start = v.getUint16(off + 16 + segX2 + s * 2)
      for (let c = start; c <= end && c !== 0xffff; c++) out.add(c)
    }
  }
  return out
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : []
  })
}

/** Code without comments (block, then line comments not inside a URL). */
const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

// Not interface text: § is the user's own formatting code, the combining marks are a regex range
// (accent folding), listing.ts writes the Modrinth/CurseForge page.
const ALLOWED = new Set([0xa7, 0x300, 0x36f])
const NOT_UI = ['listing.ts']

describe('pixel font coverage', () => {
  it('has every character the interface shows', () => {
    const font = fontCodePoints(join(FONTS, 'PixelOperator.ttf'))
    const bold = fontCodePoints(join(FONTS, 'PixelOperator-Bold.ttf'))
    const missing: string[] = []
    for (const file of [...sources(join(SRC, 'renderer')), ...sources(join(SRC, 'shared'))]) {
      if (NOT_UI.some((name) => file.endsWith(name))) continue
      const code = withoutComments(readFileSync(file, 'utf8'))
      for (const ch of new Set(code)) {
        const c = ch.codePointAt(0) ?? 0
        if (c < 0x80 || ALLOWED.has(c) || (font.has(c) && bold.has(c))) continue
        missing.push(`${ch} U+${c.toString(16)} in ${file.slice(SRC.length + 1)}`)
      }
    }
    expect(missing).toEqual([])
  })
})
