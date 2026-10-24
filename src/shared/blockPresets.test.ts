import { describe, expect, it } from 'vitest'
import { bushyLeavesModel, grassSidesModel, ladder3dModel, presetsFor } from './blockPresets'
import { checkModel } from './modelRules'

const OLD_AND_NEW = { min: { major: 34, minor: 0 }, max: { major: 94, minor: 0 } }
const errors = (model: unknown) =>
  checkModel(model, OLD_AND_NEW).filter((issue) => issue.severity === 'error')

describe('block presets', () => {
  it('offers the presets that fit a texture', () => {
    const ids = (path: string) => presetsFor(path).map((p) => `${p.id} ${p.model}`)
    expect(ids('assets/minecraft/textures/block/oak_leaves.png')).toEqual([
      'bushy_leaves minecraft:block/oak_leaves'
    ])
    expect(ids('assets/minecraft/textures/block/grass_block_side.png')).toEqual([
      'grass_sides minecraft:block/grass_block'
    ])
    expect(ids('assets/minecraft/textures/block/ladder.png')).toEqual([
      'ladder_3d minecraft:block/ladder'
    ])
    expect(ids('assets/minecraft/textures/block/stone.png')).toEqual([])
  })

  it('writes valid models for every version', () => {
    expect(errors(bushyLeavesModel('minecraft:block/oak_leaves'))).toEqual([])
    expect(errors(grassSidesModel())).toEqual([])
  })

  it('tints every leaf face and keeps the planes in the model space', () => {
    const model = bushyLeavesModel('minecraft:block/oak_leaves', 4) as {
      elements: Array<{
        from: number[]
        to: number[]
        faces: Record<string, { tintindex: number }>
      }>
    }
    expect(model.elements).toHaveLength(5)
    for (const element of model.elements) {
      expect(Object.values(element.faces).every((f) => f.tintindex === 0)).toBe(true)
      expect([...element.from, ...element.to].every((v) => v >= -16 && v <= 32)).toBe(true)
    }
  })

  it('extrudes the ladder against the south wall, read from the north', () => {
    // Two rails and one rung of a 16×16 ladder.
    const opaque = (x: number, y: number) => x === 2 || x === 13 || y === 8
    const result = ladder3dModel(16, 16, opaque, 'block/ladder')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(errors(result.model)).toEqual([])
    const elements = result.model['elements'] as Array<{ from: number[]; to: number[] }>
    expect(elements.every((e) => e.from[2] === 15 && e.to[2] === 16)).toBe(true)
    // The rail at texture x 2 sits at model x 13–14 (16 − 3 … 16 − 2): seen from the north,
    // model +x is on the viewer's left, so it reads on the left as in the texture.
    expect(elements.some((e) => e.from[0] === 13 && e.to[0] === 14)).toBe(true)
  })
})
