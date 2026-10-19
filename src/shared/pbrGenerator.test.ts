import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HEIGHT,
  DEFAULT_NORMALS,
  DEFAULT_OCCLUSION,
  heightFromAlbedo,
  MIN_HEIGHT,
  normalsFromHeight,
  occlusionFromHeight,
  opaqueMask,
  type MapGrid
} from './pbrGenerator'

function grid(width: number, height: number, wrap = true, frameHeight = height): MapGrid {
  return { width, height, frameHeight, wrap }
}

/** RGBA of gray pixels (alpha 255 unless given as [gray, alpha]). */
function grays(values: ReadonlyArray<number | [number, number]>): Uint8Array {
  const out = new Uint8Array(values.length * 4)
  values.forEach((value, i) => {
    const [g, a] = typeof value === 'number' ? [value, 255] : value
    out.set([g, g, g, a], i * 4)
  })
  return out
}

describe('heightFromAlbedo', () => {
  it('maps the lightest pixel to the surface and the darkest to the chosen depth', () => {
    const h = heightFromAlbedo(grays([10, 60, 110]), grid(3, 1), { ...DEFAULT_HEIGHT, depth: 1 })
    expect(h[2]).toBe(255)
    // Never 0: the spec advises a minimum of 1.
    expect(h[0]).toBe(MIN_HEIGHT)
    expect(Math.abs(h[1]! - 127.5)).toBeLessThanOrEqual(0.5)
  })

  it('keeps the depth fraction and inverts on request', () => {
    const half = heightFromAlbedo(grays([0, 255]), grid(2, 1), { ...DEFAULT_HEIGHT, depth: 0.5 })
    expect([...half]).toEqual([128, 255])
    const inverted = heightFromAlbedo(grays([0, 255]), grid(2, 1), {
      ...DEFAULT_HEIGHT,
      depth: 0.5,
      invert: true
    })
    expect([...inverted]).toEqual([255, 128])
  })

  it('without auto levels uses the absolute lightness', () => {
    const h = heightFromAlbedo(grays([255, 255]), grid(2, 1), {
      ...DEFAULT_HEIGHT,
      autoLevels: false,
      depth: 1
    })
    expect([...h]).toEqual([255, 255])
    const flat = heightFromAlbedo(grays([100, 100]), grid(2, 1), { ...DEFAULT_HEIGHT, depth: 1 })
    // A single color has no relief: at the surface (inverted too), not a division by zero.
    expect([...flat]).toEqual([255, 255])
    const invertedFlat = heightFromAlbedo(grays([100, 100]), grid(2, 1), {
      ...DEFAULT_HEIGHT,
      depth: 1,
      invert: true
    })
    expect([...invertedFlat]).toEqual([255, 255])
  })

  it('quantizes to steps for a blocky relief', () => {
    const h = heightFromAlbedo(grays([0, 80, 170, 255]), grid(4, 1), {
      ...DEFAULT_HEIGHT,
      depth: 1,
      steps: 2
    })
    expect([...h]).toEqual([MIN_HEIGHT, MIN_HEIGHT, 255, 255])
  })

  it('leaves transparent pixels at the surface and out of the levels', () => {
    const h = heightFromAlbedo(grays([[0, 0], 100, 200]), grid(3, 1), {
      ...DEFAULT_HEIGHT,
      depth: 1
    })
    expect([...h]).toEqual([255, MIN_HEIGHT, 255])
  })

  it('blurs across the edges of a tiling texture', () => {
    const values = [0, 255, 255, 255]
    const wrapped = heightFromAlbedo(grays(values), grid(4, 1), {
      ...DEFAULT_HEIGHT,
      autoLevels: false,
      depth: 1,
      blur: 1
    })
    // Pixel 3 sees pixel 0 (dark) as its right neighbour.
    expect(wrapped[3]).toBeLessThan(255)
    const clamped = heightFromAlbedo(grays(values), grid(4, 1, false), {
      ...DEFAULT_HEIGHT,
      autoLevels: false,
      depth: 1,
      blur: 1
    })
    expect(clamped[3]).toBe(255)
  })
})

describe('normalsFromHeight', () => {
  it('is flat (128, 128) on a flat height map', () => {
    const n = normalsFromHeight(new Uint8Array(16).fill(200), grid(4, 4), DEFAULT_NORMALS)
    expect([...n]).toEqual(new Array(32).fill(128))
  })

  it('points right (red > 128) where the surface goes down to the right, DirectX green', () => {
    // Left half high, right half low; no wrap so only the middle edge counts.
    const heights = new Uint8Array(4 * 4)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) heights[y * 4 + x] = x < 2 ? 255 : 0
    const n = normalsFromHeight(heights, grid(4, 4, false), DEFAULT_NORMALS)
    const at = (x: number, y: number): [number, number] => [
      n[(y * 4 + x) * 2]!,
      n[(y * 4 + x) * 2 + 1]!
    ]
    expect(at(1, 1)[0]).toBeGreaterThan(128)
    expect(at(2, 1)[0]).toBeGreaterThan(128)
    expect(at(1, 1)[1]).toBe(128)
    expect(at(0, 1)).toEqual([128, 128])

    // Top high, bottom low: the slope faces down = green above 128 (Y−, 255 = bottom).
    const rows = new Uint8Array(4 * 4)
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) rows[y * 4 + x] = y < 2 ? 255 : 0
    const m = normalsFromHeight(rows, grid(4, 4, false), DEFAULT_NORMALS)
    expect(m[(1 * 4 + 1) * 2 + 1]).toBeGreaterThan(128)
  })

  it('wraps around the edges and inside each animation frame', () => {
    const heights = new Uint8Array([255, 255, 255, 0])
    const wrapped = normalsFromHeight(heights, grid(4, 1), DEFAULT_NORMALS)
    // Pixel 0 has the low pixel 3 on its left: it faces left.
    expect(wrapped[0]).toBeLessThan(128)
    const clamped = normalsFromHeight(heights, grid(4, 1, false), DEFAULT_NORMALS)
    expect(clamped[0]).toBe(128)

    // Two 1×2 frames: frame 0 is flat, so it must not see frame 1.
    const strip = new Uint8Array([200, 200, 0, 255])
    const frames = normalsFromHeight(strip, grid(1, 4, true, 2), DEFAULT_NORMALS)
    expect([frames[0], frames[1], frames[2], frames[3]]).toEqual([128, 128, 128, 128])
  })

  it('gets steeper with strength, and Scharr agrees in direction', () => {
    const heights = new Uint8Array([255, 255, 0, 0])
    const soft = normalsFromHeight(heights, grid(4, 1), { ...DEFAULT_NORMALS, strength: 0.2 })
    const hard = normalsFromHeight(heights, grid(4, 1), { ...DEFAULT_NORMALS, strength: 3 })
    expect(hard[2]!).toBeGreaterThan(soft[2]!)
    const scharr = normalsFromHeight(heights, grid(4, 1), { ...DEFAULT_NORMALS, filter: 'scharr' })
    expect(scharr[2]!).toBeGreaterThan(128)
  })
})

describe('cutout textures (plants)', () => {
  it('a leaf among see-through pixels is neither sloped nor occluded by them', () => {
    // A 1-pixel stem in the middle of a 5×5 transparent texture: the empty pixels are at 255.
    const heights = new Uint8Array(25).fill(255)
    heights[12] = 128
    const opaque = new Uint8Array(25)
    opaque[12] = 1
    expect(opaqueMask(grays([[0, 0], 10, [0, 0]]), 3)).toEqual(new Uint8Array([0, 1, 0]))
    const walls = occlusionFromHeight(heights, grid(5, 5), DEFAULT_OCCLUSION)
    expect(walls[12]).toBeLessThan(200)
    const ao = occlusionFromHeight(heights, grid(5, 5), DEFAULT_OCCLUSION, opaque)
    expect(ao[12]).toBe(255)
    const normals = normalsFromHeight(heights, grid(5, 5), DEFAULT_NORMALS, opaque)
    expect([normals[24], normals[25]]).toEqual([128, 128])
  })
})

describe('occlusionFromHeight', () => {
  it('leaves flat or raised pixels open and shades a pit', () => {
    const flat = occlusionFromHeight(new Uint8Array(9).fill(255), grid(3, 3), DEFAULT_OCCLUSION)
    expect([...flat]).toEqual(new Array(9).fill(255))

    const pit = new Uint8Array(25).fill(255)
    pit[12] = MIN_HEIGHT
    const ao = occlusionFromHeight(pit, grid(5, 5), DEFAULT_OCCLUSION)
    expect(ao[12]).toBeLessThan(200)
    // The rim sees only the pit below it.
    expect(ao[0]).toBe(255)
  })

  it('strength 0 means no occlusion', () => {
    const pit = new Uint8Array(25).fill(255)
    pit[12] = MIN_HEIGHT
    const ao = occlusionFromHeight(pit, grid(5, 5), { ...DEFAULT_OCCLUSION, strength: 0 })
    expect(ao[12]).toBe(255)
  })
})
