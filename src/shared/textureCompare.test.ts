import { describe, expect, it } from 'vitest'
import { compareTextures, diffImage, onGrid, type Image } from './textureCompare'

function image(width: number, height: number, texels: ReadonlyArray<readonly number[]>): Image {
  const data = new Uint8Array(width * height * 4)
  texels.forEach((t, i) => data.set(t, i * 4))
  return { width, height, data }
}

const gray = (v: number, a = 255): number[] => [v, v, v, a]

describe('compareTextures', () => {
  it('finds identical textures identical', () => {
    const a = image(2, 1, [gray(100), gray(200)])
    const c = compareTextures(a, a)
    expect(c.changed).toBe(0)
    expect(c.meanShift).toBe(0)
    expect(c.newColors).toBe(0)
    expect(c.scale).toBe(1)
  })

  it('counts changed pixels, ignoring tiny rounding and hidden colors under transparency', () => {
    const mine = image(4, 1, [gray(101), gray(150), gray(9, 0), gray(80)])
    const vanilla = image(4, 1, [gray(100), gray(100), gray(0, 0), gray(80, 0)])
    const c = compareTextures(mine, vanilla)
    expect([...c.delta]).toEqual([1, 50, 0, 255])
    expect(c.changed).toBe(2)
    expect(c.alphaChanged).toBe(1)
  })

  it('compares a 2× texture on its own grid', () => {
    const mine = image(2, 2, [gray(10), gray(10), gray(10), gray(90)])
    const vanilla = image(1, 1, [gray(10)])
    const c = compareTextures(mine, vanilla)
    expect([c.width, c.height, c.scale]).toEqual([2, 2, 2])
    expect(c.changed).toBe(1)
  })

  it('measures palette and mean color', () => {
    const mine = image(2, 1, [gray(200), [200, 50, 50, 255]])
    const vanilla = image(2, 1, [gray(100), gray(100)])
    const c = compareTextures(mine, vanilla)
    expect(c.colorsMine).toBe(2)
    expect(c.colorsVanilla).toBe(1)
    expect(c.newColors).toBe(2)
    expect(c.lightnessShift).toBeGreaterThan(0)
    expect(c.meanShift).toBeGreaterThan(c.lightnessShift - 0.001)
  })
})

describe('diffImage / onGrid', () => {
  it('paints changes hot and the rest dim', () => {
    const vanilla = image(2, 1, [gray(200), gray(200)])
    const c = compareTextures(image(2, 1, [gray(200), gray(0)]), vanilla)
    const out = diffImage(c, vanilla)
    expect(out[0]).toBeLessThan(100)
    expect([out[4], out[6]]).toEqual([255, 40])
  })

  it('scales by nearest', () => {
    expect([...onGrid(image(1, 1, [gray(7)]), 2, 1)]).toEqual([7, 7, 7, 255, 7, 7, 7, 255])
  })
})
