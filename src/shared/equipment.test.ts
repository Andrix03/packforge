import { describe, expect, it } from 'vitest'
import {
  applyPalette,
  offPalettePixels,
  boxFaces,
  equipmentTexturePath,
  parseEquipment,
  trimPalettePath
} from './equipment'
import type { FormatRange } from './modelRules'

const ONLY_26_3: FormatRange = { min: { major: 97, minor: 1 }, max: { major: 97, minor: 1 } }
const FROM_1_21_4: FormatRange = { min: { major: 46, minor: 0 }, max: { major: 97, minor: 1 } }

describe('parseEquipment', () => {
  it('reads layers like the game (leather: dyeable base + overlay)', () => {
    const leather = {
      layers: {
        humanoid: [
          { texture: 'minecraft:leather', dyeable: { color_when_undyed: -6265536 } },
          { texture: 'minecraft:leather_overlay' }
        ]
      }
    }
    const { layers, issues } = parseEquipment(leather, ONLY_26_3)
    expect(issues).toEqual([])
    expect(layers.map((l) => [l.texture, l.dyeable, l.undyed])).toEqual([
      ['minecraft:leather', true, -6265536],
      ['minecraft:leather_overlay', false, null]
    ])
  })

  it('flags unknown layers and ones older targets do not draw', () => {
    const json = { layers: { humanoid_baby: [{ texture: 'x' }], tail: [{ texture: 'y' }] } }
    const messages = parseEquipment(json, FROM_1_21_4).issues.map((i) => i.message)
    expect(messages.some((m) => m.includes('26.1'))).toBe(true)
    expect(messages.some((m) => m.includes('sconosciuto'))).toBe(true)
  })
})

describe('paths', () => {
  it('resolves texture ids per layer and palettes per format', () => {
    expect(equipmentTexturePath('humanoid', 'minecraft:diamond')).toBe(
      'assets/minecraft/textures/entity/equipment/humanoid/diamond.png'
    )
    expect(trimPalettePath('gold', { major: 97, minor: 1 })).toBe(
      'assets/minecraft/textures/palettes/trim/gold.png'
    )
    expect(trimPalettePath('gold', { major: 46, minor: 0 })).toContain(
      'trims/color_palettes/gold.png'
    )
  })
})

describe('applyPalette', () => {
  it('swaps base palette colors for the material ones, index by index', () => {
    const base = { width: 2, height: 1, data: [10, 10, 10, 255, 20, 20, 20, 255] }
    const gold = { width: 2, height: 1, data: [200, 150, 0, 255, 250, 200, 50, 255] }
    const trim = { width: 3, height: 1, data: [20, 20, 20, 128, 10, 10, 10, 255, 99, 99, 99, 255] }
    expect([...applyPalette(trim, base, gold)]).toEqual([
      250, 200, 50, 128, 200, 150, 0, 255, 99, 99, 99, 255
    ])
  })
})

describe('boxFaces', () => {
  it('unfolds a box like the game (the 8×8×8 head)', () => {
    const head = boxFaces(0, 0, 8, 8, 8)
    expect(head['top']).toEqual({ x: 8, y: 0, width: 8, height: 8 })
    expect(head['front']).toEqual({ x: 8, y: 8, width: 8, height: 8 })
    expect(head['back']).toEqual({ x: 24, y: 8, width: 8, height: 8 })
  })
})

describe('offPalettePixels', () => {
  const px = (colors: number[][]) => ({
    width: colors.length,
    height: 1,
    data: new Uint8ClampedArray(colors.flat())
  })
  const base = px([
    [224, 224, 224, 255],
    [192, 192, 192, 255]
  ])

  it('counts opaque pixels outside the base greys, not the transparent ones', () => {
    const pattern = px([
      [224, 224, 224, 255],
      [255, 255, 255, 255],
      [200, 200, 200, 255],
      [10, 10, 10, 0]
    ])
    expect(offPalettePixels(pattern, base)).toBe(2)
  })

  it('is zero for a pattern painted with the base greys', () => {
    expect(offPalettePixels(px([[192, 192, 192, 255]]), base)).toBe(0)
  })
})
