import { describe, expect, it } from 'vitest'
import { CMD_ICONS, NAV_ICONS, TOOL_ICONS } from './icons'
import * as P from './pictures'
import { PixelGrid, art, noiseRows, pictureBackground, pictureSvg } from './pixelArt'
import { fromStep, segThumbLeft, toStep } from './slider'

/** Cells covered by a run path, as "x,y" strings. */
function cellsOf(path: string): Set<string> {
  const out = new Set<string>()
  for (const m of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    const [x, y, w, back] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
    expect(back).toBe(w)
    for (let i = 0; i < w; i++) out.add(`${x + i},${y}`)
  }
  return out
}

describe('PixelGrid', () => {
  it('merges horizontal runs and clips to the grid', () => {
    const g = new PixelGrid().rect(14, 0, 5, 1).p(-1, 3).p(0, 15)
    expect(g.path()).toBe('M14 0h2v1h-2zM0 15h1v1h-1z')
    expect(g.count).toBe(3)
  })

  it('draws thick boxes, lines, rings and clears', () => {
    const box = new PixelGrid().box(0, 0, 6, 6, 2)
    expect(box.count).toBe(36 - 4)
    expect(new PixelGrid().line(0, 0, 3, 3, 2).has(4, 4)).toBe(true)
    const ring = new PixelGrid().ring(8, 8, 6, 2)
    expect(ring.has(8, 8)).toBe(false)
    expect(ring.has(8, 2)).toBe(true)
    expect(new PixelGrid().rect(0, 0, 4, 4).clear(1, 1, 2, 2).count).toBe(12)
  })

  it('reads two-tone art rows', () => {
    const icon = art(['#+', '.#'])
    expect(cellsOf(icon.a)).toEqual(new Set(['0,0', '1,1']))
    expect(cellsOf(icon.b)).toEqual(new Set(['1,0']))
  })
})

describe('icons from the design canvas', () => {
  it('stay inside 16×16 and every icon has a full-colour part', () => {
    for (const set of [NAV_ICONS, TOOL_ICONS, CMD_ICONS]) {
      for (const [name, icon] of Object.entries(set)) {
        const all = [...cellsOf(icon.a), ...cellsOf(icon.b)]
        expect(cellsOf(icon.a).size, name).toBeGreaterThan(0)
        for (const c of all) {
          const [x = -1, y = -1] = c.split(',').map(Number)
          expect(x >= 0 && x < 16 && y >= 0 && y < 16, `${name} ${c}`).toBe(true)
        }
      }
    }
  })

  it('command icons have no lonely 1 px pixels (they blur when the window is scaled)', () => {
    for (const [name, icon] of Object.entries(CMD_ICONS)) {
      const cells = new Set([...cellsOf(icon.a), ...cellsOf(icon.b)])
      for (const c of cells) {
        const [x = 0, y = 0] = c.split(',').map(Number)
        const neighbours = [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1]
        ].filter(([a, b]) => cells.has(`${a},${b}`)).length
        expect(neighbours, `${name} ${c}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('pictures', () => {
  const sets = Object.entries(P).filter(([k]) => k.endsWith('_PICTURES')) as [
    string,
    Record<string, P.PixelPicture>
  ][]

  it('are rectangular and every char has a palette entry', () => {
    expect(sets.length).toBeGreaterThanOrEqual(10)
    for (const [setName, set] of sets) {
      for (const [name, pic] of Object.entries(set)) {
        const w = pic.rows[0]?.length ?? 0
        for (const row of pic.rows) {
          expect(row.length, `${setName}.${name}`).toBe(w)
          for (const ch of row) expect(ch in pic.palette, `${setName}.${name} '${ch}'`).toBe(true)
        }
      }
    }
  })

  it('become cached SVG backgrounds with sharp edges', () => {
    const svg = pictureSvg(['ab', 'b.'], { a: '#ff0000', b: '#00ff00', '.': '' })
    expect(svg).toContain('viewBox="0 0 2 2"')
    expect(svg.match(/<rect /g)).toHaveLength(3)
    expect(pictureBackground(['a'], { a: '#000' })).toMatch(/^url\("data:image\/svg\+xml,%3Csvg/)
    expect(P.pictureCss(P.LIGHT_PICTURES.noon)).toBe(P.pictureCss(P.LIGHT_PICTURES.noon))
  })

  it('noise is deterministic and keeps mask chars', () => {
    expect(noiseRows(3, 1)).toEqual(noiseRows(3, 1))
    const masked = noiseRows(2, 2, ['w.......'])
    expect(masked[0]?.[0]).toBe('w')
    expect(masked).toHaveLength(8)
  })
})

describe('segmented slider', () => {
  it('keeps the thumb inside and maps steps both ways', () => {
    expect(segThumbLeft(0, 10)).toBe('calc(0% - 0px)')
    expect(segThumbLeft(10, 10)).toBe('calc(100% - 22px)')
    expect(segThumbLeft(99, 10)).toBe('calc(100% - 22px)')
    expect(toStep(0.5, 0, 1, 10)).toBe(5)
    expect(fromStep(5, 0, 1, 10)).toBe(0.5)
    expect(toStep(3, 2, 2, 10)).toBe(0)
  })
})
