import { describe, expect, it } from 'vitest'
import { buildQuads } from './blockGeometry'
import { resolveModel } from './blockModel'
import { PLANT_SHAPES, plantShapeModel, topTextureId } from './plantShapes'
import { variantModel } from './randomVariants'

const TEXTURE = 'minecraft:block/wheat_stage7'

async function quadsOf(model: Record<string, unknown>) {
  const resolved = await resolveModel('minecraft:block/test', async (path) =>
    path === 'assets/minecraft/models/block/test.json' ? model : null
  )
  expect(resolved.warnings).toEqual([])
  return buildQuads(resolved, { x: 0, y: 0 })
}

describe('plantShapeModel', () => {
  it('uses the vanilla parents for crop and cross', () => {
    expect(plantShapeModel('crop', TEXTURE)).toEqual({
      parent: 'minecraft:block/crop',
      textures: { crop: TEXTURE }
    })
    expect(plantShapeModel('cross', TEXTURE)).toEqual({
      parent: 'minecraft:block/cross',
      textures: { crop: TEXTURE, cross: '#crop' }
    })
  })

  it('builds a bushy plant: 4 planes leaning outwards and 2 diagonals, both sides', async () => {
    const quads = await quadsOf(plantShapeModel('bushy', TEXTURE))
    expect(quads).toHaveLength(12)
    expect(quads.every((q) => q.thin && q.texture?.id === TEXTURE)).toBe(true)
    // The west plane (x = 4 at its base) leans out: its top is further west than its base.
    const west = quads[0]!
    const xs = west.positions.map((p) => p[0])
    const ys = west.positions.map((p) => p[1])
    const top = xs[ys.indexOf(Math.max(...ys))]!
    const bottom = xs[ys.indexOf(Math.min(...ys))]!
    expect(top).toBeLessThan(bottom)
    expect(bottom).toBeCloseTo(4)
  })

  it('stacks a second block of planes with the top texture for the tall shape', async () => {
    const model = plantShapeModel('tall', TEXTURE, topTextureId(TEXTURE))
    const quads = await quadsOf(model)
    expect(quads).toHaveLength(16)
    const top = quads.filter((q) => q.texture?.id === `${TEXTURE}_top`)
    expect(top).toHaveLength(8)
    expect(Math.max(...top.flatMap((q) => q.positions.map((p) => p[1])))).toBe(31)
  })

  it('keeps every element inside the format limits (−16…32, rotations of 22.5° steps up to 45°)', () => {
    for (const { id } of PLANT_SHAPES) {
      const model = plantShapeModel(id, TEXTURE, topTextureId(TEXTURE))
      for (const element of (model['elements'] ?? []) as Array<{
        from: number[]
        to: number[]
        rotation?: { angle: number }
      }>) {
        for (const v of [...element.from, ...element.to]) {
          expect(v).toBeGreaterThanOrEqual(-16)
          expect(v).toBeLessThanOrEqual(32)
        }
        if (element.rotation) {
          expect(Math.abs(element.rotation.angle)).toBeLessThanOrEqual(45)
          expect(Math.abs(element.rotation.angle % 22.5)).toBe(0)
        }
      }
    }
  })
})

describe('plant shapes and random variants', () => {
  it('keep the texture in `crop`, so a variant made before or after still overrides it', () => {
    for (const { id } of PLANT_SHAPES) {
      const base = plantShapeModel(id, TEXTURE, topTextureId(TEXTURE))
      expect(
        variantModel('block/wheat_stage7', base, TEXTURE, `${TEXTURE}_v2`)?.['textures']
      ).toEqual({ crop: `${TEXTURE}_v2` })
    }
  })
})
