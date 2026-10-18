import { describe, expect, it } from 'vitest'
import { analyzeTexture } from './advice'
import type { PixelBuffer, Rgba } from './pixels'

function image(width: number, pixels: Rgba[]): PixelBuffer {
  return {
    width,
    height: pixels.length / width,
    data: Uint8ClampedArray.from(pixels.flat())
  }
}

const gray = (v: number): Rgba => [v, v, v, 255]
const ids = (buffer: PixelBuffer): string[] => analyzeTexture(buffer).map((a) => a.id)

describe('analyzeTexture', () => {
  it('is quiet on a vanilla-like low-contrast texture', () => {
    // Like stone: a few close grays.
    const shades = [gray(110), gray(120), gray(128), gray(136)]
    const pixels = Array.from({ length: 16 }, (_, i) => shades[(i * 7) % 4]!)
    expect(ids(image(4, pixels))).toEqual([])
  })

  it('warns about more than 16 colors', () => {
    const pixels = Array.from({ length: 18 }, (_, i) => gray(100 + i * 2))
    expect(ids(image(18, pixels))).toContain('too-many-colors')
  })

  it('counts every place where the darkest touches the lightest', () => {
    // Row: dark, light, mid, light, dark → 2 dark/light contacts.
    const advice = analyzeTexture(image(5, [gray(20), gray(230), gray(120), gray(230), gray(20)]))
    const touch = advice.find((a) => a.id === 'extremes-touch')
    expect(touch?.message).toContain('2 punti')
  })

  it('warns with only two colors too (hard black/white stripes)', () => {
    expect(ids(image(2, [gray(20), gray(20), gray(230), gray(230)]))).toContain('extremes-touch')
  })

  it('also checks vertical neighbors and ignores transparent pixels', () => {
    const t: Rgba = [0, 0, 0, 0]
    const pixels = [gray(20), t, gray(230), t, gray(120), t]
    expect(ids(image(3, pixels))).not.toContain('extremes-touch')
    const vertical = [gray(20), gray(120), gray(230), gray(120)]
    expect(ids(image(2, vertical))).toContain('extremes-touch')
  })

  it('warns about harsh contrast but not about a few bright accents', () => {
    const half = [...Array(8).fill(gray(30)), ...Array(8).fill(gray(220))] as Rgba[]
    expect(ids(image(4, half))).toContain('high-contrast')
    const accents = [...Array(15).fill(gray(120)), gray(250)] as Rgba[]
    expect(ids(image(4, accents))).not.toContain('high-contrast')
  })
})
