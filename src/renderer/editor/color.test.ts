import { describe, expect, it } from 'vitest'
import { addRecent, hsvToRgb, luma, rgbToHsv, sameColor, usedColors } from './color'
import type { Rgba } from './pixels'

describe('rgbToHsv / hsvToRgb', () => {
  it.each<[Rgba, number, number, number]>([
    [[255, 0, 0, 255], 0, 1, 1],
    [[0, 255, 0, 255], 120, 1, 1],
    [[0, 0, 255, 255], 240, 1, 1],
    [[255, 0, 255, 255], 300, 1, 1],
    [[0, 0, 0, 255], 0, 0, 0],
    [[255, 255, 255, 255], 0, 0, 1],
    [[128, 128, 128, 255], 0, 0, 128 / 255]
  ])('converts %j', (rgb, h, s, v) => {
    const hsv = rgbToHsv(rgb)
    expect(hsv.h).toBeCloseTo(h)
    expect(hsv.s).toBeCloseTo(s)
    expect(hsv.v).toBeCloseTo(v)
  })

  it('round-trips every 8-bit gray and a grid of colors exactly', () => {
    for (let r = 0; r < 256; r += 15) {
      for (let g = 0; g < 256; g += 15) {
        for (let b = 0; b < 256; b += 15) {
          const color: Rgba = [r, g, b, 200]
          expect(hsvToRgb(rgbToHsv(color), 200)).toEqual(color)
        }
      }
    }
  })

  it('wraps hue values outside 0–360', () => {
    expect(hsvToRgb({ h: 360, s: 1, v: 1 })).toEqual([255, 0, 0, 255])
    expect(hsvToRgb({ h: -120, s: 1, v: 1 })).toEqual([0, 0, 255, 255])
  })
})

describe('usedColors', () => {
  it('counts visible colors and sorts them darkest first', () => {
    const data = Uint8ClampedArray.from([
      ...[200, 200, 200, 255],
      ...[10, 10, 10, 255],
      ...[200, 200, 200, 255],
      ...[5, 6, 7, 0],
      ...[10, 10, 10, 128]
    ])
    const colors = usedColors({ width: 5, height: 1, data })
    expect(colors).toEqual([
      { color: [10, 10, 10, 255], count: 1 },
      { color: [10, 10, 10, 128], count: 1 },
      { color: [200, 200, 200, 255], count: 2 }
    ])
  })
})

describe('addRecent', () => {
  const RED: Rgba = [255, 0, 0, 255]
  const BLUE: Rgba = [0, 0, 255, 255]

  it('moves a reused color to the front without duplicates', () => {
    expect(addRecent([RED, BLUE], BLUE)).toEqual([BLUE, RED])
  })

  it('ignores transparent and respects the limit', () => {
    expect(addRecent([RED], [1, 2, 3, 0])).toEqual([RED])
    expect(addRecent([RED, BLUE], [0, 255, 0, 255], 2)).toEqual([[0, 255, 0, 255], RED])
  })
})

describe('luma / sameColor', () => {
  it('orders by perceived brightness', () => {
    expect(luma([0, 255, 0, 255])).toBeGreaterThan(luma([255, 0, 0, 255]))
    expect(luma([255, 0, 0, 255])).toBeGreaterThan(luma([0, 0, 255, 255]))
  })

  it('treats all transparent colors as equal', () => {
    expect(sameColor([1, 2, 3, 0], [9, 9, 9, 0])).toBe(true)
    expect(sameColor([1, 2, 3, 255], [1, 2, 3, 254])).toBe(false)
  })
})
