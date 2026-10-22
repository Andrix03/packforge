import { describe, expect, it } from 'vitest'
import { factorBetween, resolutionHistogram, scaledSize, scaleMcmeta, scaleNearest } from './resize'

const px = (...values: number[]): Uint8Array => {
  const out = new Uint8Array(values.length * 4)
  values.forEach((v, i) => out.set([v, v, v, 255], i * 4))
  return out
}
const grays = (data: ArrayLike<number>): number[] =>
  Array.from({ length: data.length / 4 }, (_, i) => data[i * 4]!)

describe('factorBetween', () => {
  it('accepts integer ratios only', () => {
    expect(factorBetween(16, 64)).toEqual({ up: 4, down: 1 })
    expect(factorBetween(64, 16)).toEqual({ up: 1, down: 4 })
    expect(factorBetween(16, 16)).toEqual({ up: 1, down: 1 })
    expect(factorBetween(16, 24)).toBeNull()
  })

  it('refuses sizes that do not divide or are too big', () => {
    expect(scaledSize(18, 18, { up: 1, down: 4 })).toBeNull()
    expect(scaledSize(16, 48, { up: 2, down: 1 })).toEqual({ width: 32, height: 96 })
    expect(scaledSize(8192, 8192, { up: 4, down: 1 })).toBeNull()
  })
})

describe('scaleNearest', () => {
  it('enlarges by repeating pixels', () => {
    const out = scaleNearest({ width: 2, height: 1, data: px(10, 20) }, { up: 2, down: 1 })!
    expect([out.width, out.height]).toEqual([4, 2])
    expect(grays(out.data)).toEqual([10, 10, 20, 20, 10, 10, 20, 20])
    expect(out.lossy).toBe(false)
  })

  it('shrinks an enlarged texture back exactly', () => {
    const big = scaleNearest({ width: 2, height: 2, data: px(1, 2, 3, 4) }, { up: 3, down: 1 })!
    const back = scaleNearest(big, { up: 1, down: 3 })!
    expect(grays(back.data)).toEqual([1, 2, 3, 4])
    expect(back.lossy).toBe(false)
  })

  it('reports detail lost when shrinking real detail', () => {
    const out = scaleNearest({ width: 2, height: 2, data: px(1, 2, 3, 4) }, { up: 1, down: 2 })!
    expect(grays(out.data)).toEqual([1])
    expect(out.lossy).toBe(true)
  })

  it('keeps LabPBR bytes exact (no blending of metal codes or emission)', () => {
    const data = Uint8Array.of(200, 231, 0, 254, 10, 10, 0, 255)
    const out = scaleNearest({ width: 2, height: 1, data }, { up: 2, down: 1 })!
    expect([...out.data.slice(0, 8)]).toEqual([200, 231, 0, 254, 200, 231, 0, 254])
  })
})

describe('scaleMcmeta', () => {
  it('scales explicit frame sizes and keeps the rest', () => {
    const text = JSON.stringify({
      animation: { frametime: 2, width: 16, height: 8 },
      texture: { blur: true }
    })
    expect(JSON.parse(scaleMcmeta(text, { up: 2, down: 1 })!)).toEqual({
      animation: { frametime: 2, width: 32, height: 16 },
      texture: { blur: true }
    })
  })

  it('has nothing to change without explicit sizes', () => {
    expect(scaleMcmeta('{"animation":{"frametime":2}}', { up: 2, down: 1 })).toBeNull()
    expect(scaleMcmeta('not json', { up: 2, down: 1 })).toBeNull()
  })

  it('refuses frame sizes that would not be whole pixels', () => {
    const text = JSON.stringify({ animation: { width: 16, height: 15 } })
    expect(() => scaleMcmeta(text, { up: 1, down: 2 })).toThrow(/height 15/)
    expect(JSON.parse(scaleMcmeta(text, { up: 2, down: 1 })!).animation.height).toBe(30)
  })
})

describe('resolutionHistogram', () => {
  it('counts the resolutions, most common first', () => {
    expect(resolutionHistogram([16, 32, 16, 64, 16])).toEqual([
      { resolution: 16, count: 3 },
      { resolution: 32, count: 1 },
      { resolution: 64, count: 1 }
    ])
  })
})
