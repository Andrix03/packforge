import { describe, expect, it } from 'vitest'
import { luma, rgbToHsv } from './color'
import { getPixel, type Rgba } from './pixels'
import {
  DEFAULT_RAMP,
  generateRamp,
  noiseColor,
  noiseFill,
  rampIndex,
  rotateToward,
  shiftAlongRamp
} from './ramp'

const GRASS: Rgba = [94, 157, 52, 255]

/** Shortest distance between two hues, in degrees. */
const hueDistance = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180)

describe('generateRamp', () => {
  it('returns 2·steps + 1 colors, base in the middle, darkest to lightest', () => {
    const ramp = generateRamp(GRASS)
    expect(ramp).toHaveLength(5)
    expect(ramp[2]).toEqual(GRASS)
    for (let i = 1; i < ramp.length; i++) expect(luma(ramp[i]!)).toBeGreaterThan(luma(ramp[i - 1]!))
  })

  it('shifts shadows toward a cool hue and highlights toward a warm hue', () => {
    const ramp = generateRamp(GRASS)
    const base = rgbToHsv(GRASS).h
    expect(hueDistance(rgbToHsv(ramp[0]!).h, 245)).toBeLessThan(hueDistance(base, 245))
    expect(hueDistance(rgbToHsv(ramp[4]!).h, 50)).toBeLessThan(hueDistance(base, 50))
  })

  it('makes shadows more saturated and highlights less saturated', () => {
    const ramp = generateRamp(GRASS)
    const s = rgbToHsv(GRASS).s
    expect(rgbToHsv(ramp[0]!).s).toBeGreaterThan(s)
    expect(rgbToHsv(ramp[4]!).s).toBeLessThan(s)
  })

  it('without hue shift keeps the hue (a plain brightness ramp)', () => {
    const ramp = generateRamp(GRASS, { ...DEFAULT_RAMP, hueShift: 0 })
    for (const color of ramp)
      expect(hueDistance(rgbToHsv(color).h, rgbToHsv(GRASS).h)).toBeLessThan(2)
  })

  it('drops duplicates when the brightness hits the limits', () => {
    const ramp = generateRamp([255, 255, 255, 255], { steps: 2, hueShift: 0, contrast: 0.1 })
    expect(new Set(ramp.map((c) => c.join())).size).toBe(ramp.length)
  })

  it('tints grays: bluish shadows, warm highlights, none without hue shift', () => {
    const ramp = generateRamp([128, 128, 128, 255])
    const [r0, , b0] = ramp[0]!
    const [r4, , b4] = ramp[4]!
    expect(b0).toBeGreaterThan(r0)
    expect(r4).toBeGreaterThan(b4)
    const neutral = generateRamp([128, 128, 128, 255], { ...DEFAULT_RAMP, hueShift: 0 })
    for (const [r, g, b] of neutral) expect(r === g && g === b).toBe(true)
  })

  it('keeps the base opacity', () => {
    for (const color of generateRamp([94, 157, 52, 180])) expect(color[3]).toBe(180)
  })
})

describe('rotateToward', () => {
  it('takes the shorter way around the circle and does not overshoot', () => {
    expect(rotateToward(350, 10, 5)).toBe(355)
    expect(rotateToward(10, 350, 5)).toBe(5)
    expect(rotateToward(100, 110, 30)).toBe(110)
  })
})

describe('shiftAlongRamp', () => {
  const ramp = generateRamp(GRASS)

  it('moves one step and stops at the ends', () => {
    expect(shiftAlongRamp(ramp, ramp[2]!, -1)).toEqual(ramp[1])
    expect(shiftAlongRamp(ramp, ramp[2]!, 1)).toEqual(ramp[3])
    expect(shiftAlongRamp(ramp, ramp[0]!, -1)).toEqual(ramp[0])
    expect(shiftAlongRamp(ramp, ramp[4]!, 1)).toEqual(ramp[4])
  })

  it('ignores colors outside the ramp', () => {
    expect(rampIndex(ramp, [1, 2, 3, 255])).toBe(-1)
    expect(shiftAlongRamp(ramp, [1, 2, 3, 255], 1)).toBeNull()
  })
})

describe('noiseColor', () => {
  it('favors the middle of the ramp', () => {
    const ramp = generateRamp(GRASS)
    let seed = 7
    const random = (): number => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }
    const counts = new Map<string, number>()
    for (let i = 0; i < 10_000; i++) {
      const key = noiseColor(ramp, random).join()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const middle = counts.get(ramp[2]!.join()) ?? 0
    const end = counts.get(ramp[0]!.join()) ?? 0
    // Weights 1:2:4:2:1 → middle ≈ 40 %, each end ≈ 10 %.
    expect(middle / 10_000).toBeCloseTo(0.4, 1)
    expect(end / 10_000).toBeCloseTo(0.1, 1)
  })

  it('covers the whole ramp at the edges of the random range', () => {
    const ramp = generateRamp(GRASS)
    expect(noiseColor(ramp, () => 0)).toEqual(ramp[0])
    expect(noiseColor(ramp, () => 0.999999)).toEqual(ramp[4])
  })
})

describe('noiseFill', () => {
  it('paints only the bucket region with ramp colors', () => {
    const ramp = generateRamp(GRASS)
    const wall: Rgba = [0, 0, 0, 255]
    // 3×1: two transparent pixels, then a wall.
    const data = new Uint8ClampedArray(12)
    data.set(wall, 8)
    const buffer = { width: 3, height: 1, data }
    const changes = noiseFill(buffer, 0, 0, ramp, 'contiguous', () => 0.5)
    expect(changes).toHaveLength(2)
    expect(getPixel(buffer, 0, 0)).toEqual(ramp[2])
    expect(getPixel(buffer, 2, 0)).toEqual(wall)
  })

  it('does nothing without a ramp', () => {
    const buffer = { width: 1, height: 1, data: new Uint8ClampedArray(4) }
    expect(noiseFill(buffer, 0, 0, [], 'global')).toEqual([])
  })
})
