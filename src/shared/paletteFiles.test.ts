import { describe, expect, it } from 'vitest'
import { exportPalette, importPalette } from './paletteFiles'

describe('importPalette', () => {
  it('reads GIMP .gpl with its name, skipping comments and bad rows', () => {
    const gpl =
      'GIMP Palette\nName: Stone\nColumns: 4\n#\n 10  20  30\tdark\n255 255 255 white\n300 0 0 bad\n'
    expect(importPalette(gpl, 'x.gpl')).toEqual({
      ok: true,
      palette: { name: 'Stone', colors: ['#0a141eff', '#ffffffff'] },
      skipped: 1
    })
  })

  it('reads Lospec .hex and Paint.NET .txt (alpha first), dropping duplicates', () => {
    expect(importPalette('ff0000\n#00FF00\nff0000\n', 'lospec-two.hex')).toMatchObject({
      palette: { name: 'lospec-two', colors: ['#ff0000ff', '#00ff00ff'] }
    })
    expect(importPalette('; comment\n80FF0000\n', 'p.txt')).toMatchObject({
      palette: { colors: ['#ff000080'] }
    })
    expect(importPalette('nothing here', 'x.hex').ok).toBe(false)
  })
})

describe('exportPalette', () => {
  const palette = { name: 'Ore', colors: ['#0a141eff', '#ff000080'] }

  it('round-trips through every format', () => {
    for (const format of ['gpl', 'hex'] as const) {
      const back = importPalette(exportPalette(palette, format), `Ore.${format}`)
      expect(back.ok && back.palette.colors).toEqual(['#0a141eff', '#ff0000ff'])
    }
    const txt = importPalette(exportPalette(palette, 'txt'), 'Ore.txt')
    expect(txt.ok && txt.palette.colors).toEqual(palette.colors)
    expect(exportPalette(palette, 'gpl')).toContain('Name: Ore')
  })
})
