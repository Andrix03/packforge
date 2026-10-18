import { describe, expect, it } from 'vitest'
import {
  DYES,
  dyeOf,
  meanColorHex,
  previewSample,
  oklabToRgb,
  recolor,
  rgbToOklab,
  variantName
} from './colorVariants'

describe('dye names', () => {
  it('has the 16 dyes once each', () => {
    expect(new Set(DYES.map((d) => d.id)).size).toBe(16)
  })

  it('reads the dye of a name, longest word first', () => {
    expect(dyeOf('light_blue_wool')?.id).toBe('light_blue')
    expect(dyeOf('light_gray_concrete_powder')?.id).toBe('light_gray')
    expect(dyeOf('blue_stained_glass_pane_top')?.id).toBe('blue')
    expect(dyeOf('redstone_block')).toBeNull()
    expect(dyeOf('stone')).toBeNull()
  })

  it('names variants by replacing the dye, or prefixing it', () => {
    const red = DYES.find((d) => d.id === 'red')!
    expect(variantName('white_wool', red)).toBe('red_wool')
    expect(variantName('light_blue_terracotta', red)).toBe('red_terracotta')
    expect(variantName('banner_base', red)).toBe('red_banner_base')
  })
})

describe('OKLab', () => {
  it('round-trips sRGB bytes', () => {
    const colors: Array<[number, number, number]> = [
      [0, 0, 0],
      [255, 255, 255],
      [176, 46, 38],
      [58, 179, 218]
    ]
    for (const [r, g, b] of colors) expect(oklabToRgb(rgbToOklab(r, g, b))).toEqual([r, g, b])
  })
})

describe('recolor', () => {
  // Two-tone gray texture with a transparent pixel.
  const source = Uint8Array.of(120, 120, 120, 255, 160, 160, 160, 255, 9, 9, 9, 0)

  it('moves the mean to the dye color and keeps the light/dark detail', () => {
    const out = recolor(source, 'b02e26', { contrast: 1, colorDetail: 1 })
    const dark = rgbToOklab(out[0]!, out[1]!, out[2]!)
    const light = rgbToOklab(out[4]!, out[5]!, out[6]!)
    const target = rgbToOklab(176, 46, 38)
    expect(light[0]).toBeGreaterThan(dark[0])
    expect((dark[0] + light[0]) / 2).toBeCloseTo(target[0], 1)
    // Reddish: red channel dominates.
    expect(out[0]).toBeGreaterThan(out[1]! + 40)
  })

  it('leaves transparent pixels and alpha untouched', () => {
    const out = recolor(source, '3c44aa')
    expect([...out.slice(8, 12)]).toEqual([9, 9, 9, 0])
    expect(out[3]).toBe(255)
  })

  it('can make white and black from a colored texture', () => {
    const red = Uint8Array.of(170, 40, 40, 255, 190, 50, 45, 255)
    const white = recolor(red, 'f9fffe')
    const black = recolor(red, '1d1d21')
    expect(Math.min(white[0]!, white[1]!, white[2]!)).toBeGreaterThan(200)
    expect(Math.max(black[0]!, black[1]!, black[2]!)).toBeLessThan(60)
  })

  it('contrast 0 gives a flat dye color', () => {
    const out = recolor(source, '80c71f', { contrast: 0, colorDetail: 0 })
    expect([...out.slice(0, 3)]).toEqual([...out.slice(4, 7)])
  })
})

describe('meanColorHex', () => {
  it('averages the opaque pixels', () => {
    expect(meanColorHex(Uint8Array.of(200, 10, 10, 255, 0, 0, 0, 0))).toBe('c80a0a')
    expect(meanColorHex(Uint8Array.of(0, 0, 0, 0))).toBeNull()
  })
})

describe('previewSample', () => {
  it('keeps small images and shrinks big ones by nearest neighbour', () => {
    const small = { width: 2, height: 1, data: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8) }
    expect(previewSample(small, 128).data).toEqual(Uint8ClampedArray.of(1, 2, 3, 4, 5, 6, 7, 8))
    const big = { width: 4, height: 2, data: new Uint8Array(32).map((_, i) => i) }
    const out = previewSample(big, 2)
    expect([out.width, out.height]).toEqual([2, 1])
    expect([...out.data.slice(0, 4)]).toEqual([0, 1, 2, 3])
    expect([...out.data.slice(4, 8)]).toEqual([8, 9, 10, 11])
  })
})
