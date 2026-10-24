import { describe, expect, it } from 'vitest'
import {
  bushyLeavesModel,
  grassSidesModel,
  ladder3dModel,
  presetsFor,
  rail3dModel,
  railModelsFor
} from './blockPresets'
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

describe('3D rails', () => {
  // Two rails (columns 2 and 13) and a tie (row 8) of a 16×16 rail texture.
  const opaque = (x: number, y: number) => x === 2 || x === 13 || y === 8

  it('lies flat where vanilla does, read from above like vanilla', () => {
    const result = rail3dModel(16, 16, opaque, 'block/rail', 'flat')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(errors(result.model)).toEqual([])
    const elements = result.model['elements'] as Array<{
      from: number[]
      to: number[]
      faces: Record<string, { uv: number[] }>
    }>
    expect(elements.every((e) => e.from[1] === 1 && e.to[1] === 2)).toBe(true)
    // The tie (texture row 8) runs along x at z 8–9, its top face showing that row.
    const tie = elements.find((e) => e.to[0]! - e.from[0]! > 8)!
    expect([tie.from[2], tie.to[2]]).toEqual([8, 9])
    expect(tie.faces['up']!.uv[1]).toBe(8)
  })

  it('tilts the sloped ones about vanilla’s pivot, and lists the models per texture', () => {
    const result = rail3dModel(16, 16, opaque, 'block/rail', 'ne')
    expect(result.ok && errors(result.model)).toEqual([])
    const first = (result.ok ? result.model['elements'] : []) as Array<{
      rotation: unknown
      from: number[]
    }>
    expect(first[0]?.rotation).toEqual({ origin: [8, 9, 8], axis: 'x', angle: 45, rescale: true })
    expect(first[0]?.from[1]).toBe(9)
    expect(railModelsFor('powered_rail_on').map((m) => m.model)).toEqual([
      'minecraft:block/powered_rail_on',
      'minecraft:block/powered_rail_on_raised_ne',
      'minecraft:block/powered_rail_on_raised_sw'
    ])
    expect(railModelsFor('rail_corner')).toHaveLength(1)
    expect(
      presetsFor('assets/minecraft/textures/block/detector_rail.png').map((p) => p.id)
    ).toEqual(['rails_3d'])
  })
})
