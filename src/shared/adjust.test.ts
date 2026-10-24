import { describe, expect, it } from 'vitest'
import { NEUTRAL_ADJUSTMENTS, adjustPixels, levelsTable } from './adjust'

describe('colour adjustments', () => {
  it('levels: black and white points stretch, gamma bends the middle', () => {
    const table = levelsTable({ black: 50, white: 200, gamma: 1 })
    expect(table[50]).toBe(0)
    expect(table[200]).toBe(255)
    expect(table[125]).toBe(128)
    expect(table[10]).toBe(0)
    const bright = levelsTable({ black: 0, white: 255, gamma: 2 })
    expect(bright[128]!).toBeGreaterThan(170)
  })

  it('neutral changes nothing (within OKLab rounding), alpha and transparent pixels kept', () => {
    const rgba = Uint8ClampedArray.from([120, 60, 30, 255, 1, 2, 3, 0, 200, 200, 200, 128])
    const out = adjustPixels(rgba, NEUTRAL_ADJUSTMENTS)
    for (let i = 0; i < rgba.length; i++)
      expect(Math.abs(out[i]! - rgba[i]!)).toBeLessThanOrEqual(1)
    expect([out[4], out[5], out[6], out[7]]).toEqual([1, 2, 3, 0])
    expect(out[11]).toBe(128)
  })

  it('only touches the masked pixels', () => {
    const rgba = Uint8ClampedArray.from([100, 100, 100, 255, 100, 100, 100, 255])
    const out = adjustPixels(
      rgba,
      { ...NEUTRAL_ADJUSTMENTS, levels: { black: 0, white: 100, gamma: 1 } },
      Uint8Array.from([0, 1])
    )
    expect([out[0], out[4]]).toEqual([100, 255])
  })
})
