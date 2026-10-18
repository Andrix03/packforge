import { describe, expect, it } from 'vitest'
import {
  buildNormal,
  buildSpecular,
  countPlan,
  neutralMap,
  planBatch,
  type ReliefOptions
} from './batchMaps'
import { DEFAULT_MATERIAL } from './materialPresets'
import { DEFAULT_HEIGHT, DEFAULT_NORMALS, DEFAULT_OCCLUSION, type MapGrid } from './pbrGenerator'

function grays(values: readonly number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4)
  values.forEach((v, i) => out.set([v, v, v, 255], i * 4))
  return out
}

const grid = (width: number, height: number): MapGrid => ({
  width,
  height,
  frameHeight: height,
  wrap: true
})

const relief = (occlusion: ReliefOptions['occlusion']): ReliefOptions => ({
  height: { ...DEFAULT_HEIGHT, depth: 1 },
  normals: DEFAULT_NORMALS,
  occlusion
})

describe('buildSpecular', () => {
  it('starts from a neutral map and writes the preset', () => {
    const out = buildSpecular(grays([120]), 1, 1, null, {
      ...DEFAULT_MATERIAL,
      preset: 'wood',
      variation: 0
    })
    expect([...out]).toEqual([70, 10, 12, 255])
  })

  it('keeps the emission of an existing map', () => {
    const out = buildSpecular(grays([120]), 1, 1, Uint8Array.of(0, 10, 0, 200), {
      ...DEFAULT_MATERIAL,
      preset: 'glass',
      variation: 0
    })
    expect([...out]).toEqual([245, 10, 0, 200])
  })
})

describe('buildNormal', () => {
  it('puts the height in A, normals in RG, AO in B', () => {
    const out = buildNormal(grays([20, 200, 200, 200]), grid(4, 1), null, relief(DEFAULT_OCCLUSION))
    // The dark pixel is the deepest, the light ones at the surface.
    expect(out[3]).toBeLessThan(out[7]!)
    expect(out[7]).toBe(255)
    // The light pixel next to the hole leans towards it.
    expect(out[4]).not.toBe(128)
    // The hole is occluded more than an open pixel.
    expect(out[2]).toBeLessThan(out[10]!)
  })

  it('keeps the existing AO when occlusion is off, 255 on a new map', () => {
    const existing = neutralMap('normal', 2, 1)
    existing[2] = 90
    expect(buildNormal(grays([50, 200]), grid(2, 1), existing, relief(null))[2]).toBe(90)
    expect(buildNormal(grays([50, 200]), grid(2, 1), null, relief(null))[2]).toBe(255)
  })
})

describe('planBatch', () => {
  const textures = [
    { albedo: 'a.png', hasNormal: false, hasSpecular: true },
    { albedo: 'b.png', hasNormal: true, hasSpecular: false }
  ]

  it('creates missing maps and skips existing ones unless overwrite is asked', () => {
    const skip = planBatch(textures, { specular: true, normal: true, overwrite: false })
    expect(skip).toEqual([
      { albedo: 'a.png', normal: 'create', specular: 'skip' },
      { albedo: 'b.png', normal: 'skip', specular: 'create' }
    ])
    expect(countPlan(skip)).toEqual({ create: 2, overwrite: 0, skip: 2 })
    const over = planBatch(textures, { specular: true, normal: false, overwrite: true })
    expect(over.map((e) => [e.normal, e.specular])).toEqual([
      [null, 'overwrite'],
      [null, 'create']
    ])
  })
})
