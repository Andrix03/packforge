import { describe, expect, it } from 'vitest'
import { FIRST_PERSON_RIGHT, itemQuads, readDisplay } from './itemModel'

describe('itemQuads', () => {
  it('makes a plate with sides only on the border of an opaque sprite', () => {
    // 2×2 opaque: front, back, and 2 sides per border direction (8 sides).
    const quads = itemQuads(2, 2, () => true, null)
    expect(quads).toHaveLength(2 + 8)
    expect(quads[0]!.normal).toEqual([0, 0, 1])
    expect(quads[1]!.normal).toEqual([0, 0, -1])
    // The plate is 1/16 block thick around z = 8.
    const zs = quads.flatMap((q) => q.positions.map((p) => p[2]))
    expect(Math.min(...zs)).toBe(7.5)
    expect(Math.max(...zs)).toBe(8.5)
  })

  it('adds sides between opaque and transparent pixels, sampling the opaque pixel', () => {
    // A single opaque pixel at (1, 0) of a 4×4 sprite: 4 sides.
    const quads = itemQuads(4, 4, (x, y) => x === 1 && y === 0, null)
    const sides = quads.slice(2)
    expect(sides).toHaveLength(4)
    for (const side of sides) {
      // UVs collapse on the pixel's center (in 0–16 units).
      for (const uv of side.uvs) expect(uv).toEqual([6, 2])
    }
    const up = sides.find((q) => q.normal[1] === 1)!
    // Top row of the sprite = top of the block (y = 16); pixel x 1 → 4..8.
    expect(up.positions.every((p) => p[1] === 16)).toBe(true)
    expect(new Set(up.positions.map((p) => p[0]))).toEqual(new Set([4, 8]))
  })

  it('maps the back face to the same pixels (seen mirrored)', () => {
    const [front, back] = itemQuads(16, 16, () => true, null)
    // The same corner of the plate shows the same pixel from both sides.
    const at = (q: typeof front, x: number, y: number) =>
      q!.uvs[q!.positions.findIndex((p) => p[0] === x && p[1] === y)]
    expect(at(front, 16, 16)).toEqual([16, 0])
    expect(at(back, 16, 16)).toEqual([16, 0])
    expect(at(back, 0, 0)).toEqual([0, 16])
  })
})

describe('readDisplay', () => {
  it('reads a display slot and fills missing fields', () => {
    const model = {
      display: { firstperson_righthand: { rotation: [0, -90, 25], scale: [0.68, 0.68, 0.68] } }
    }
    expect(readDisplay(model, 'firstperson_righthand')).toEqual({
      rotation: [0, -90, 25],
      translation: [0, 0, 0],
      scale: [0.68, 0.68, 0.68]
    })
    expect(readDisplay(model, 'head')).toBeNull()
    expect(readDisplay('nope', 'head')).toBeNull()
  })

  it('clamps values like the game', () => {
    const model = { display: { gui: { translation: [100, 0, 0], scale: [9, 1, 1] } } }
    expect(readDisplay(model, 'gui')).toMatchObject({ translation: [80, 0, 0], scale: [4, 1, 1] })
    expect(FIRST_PERSON_RIGHT.rotation).toEqual([0, -90, 25])
  })
})
