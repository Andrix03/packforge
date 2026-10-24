import { describe, expect, it } from 'vitest'
import { checkModel } from './modelRules'
import { cubeElement, editableModel, elementsOf } from './modelEdit'

const FILES: Record<string, unknown> = {
  'assets/minecraft/models/block/cube.json': {
    parent: 'block/block',
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: { up: { texture: '#up' }, down: { texture: '#down' } }
      }
    ]
  },
  'assets/minecraft/models/block/cube_all.json': {
    parent: 'block/cube',
    textures: { particle: '#all', up: '#all', down: '#all' }
  },
  'assets/minecraft/models/block/block.json': { display: {} },
  'assets/minecraft/models/block/stone.json': {
    parent: 'minecraft:block/cube_all',
    textures: { all: 'minecraft:block/stone' }
  },
  'assets/minecraft/models/block/own.json': {
    textures: { side: 'block/a' },
    elements: [{ from: [1, 1, 1], to: [2, 2, 2], faces: { north: { texture: '#side' } } }],
    ambientocclusion: false
  }
}
const load = async (path: string) => FILES[path] ?? null

describe('element editor helpers', () => {
  it('copies inherited elements into the model, keeping its fields and parent', async () => {
    const edit = await editableModel('minecraft:block/stone', load)
    expect(edit?.inherited).toBe(true)
    expect(edit?.json['parent']).toBe('minecraft:block/cube_all')
    expect(elementsOf(edit!.json)).toHaveLength(1)
    expect(edit?.variables).toEqual(['#all', '#down', '#up'])
    // A copy: editing it does not touch the parent's JSON.
    elementsOf(edit!.json)[0]!.from[0] = 5
    expect(
      (FILES['assets/minecraft/models/block/cube.json'] as { elements: Array<{ from: number[] }> })
        .elements[0]!.from[0]
    ).toBe(0)
  })

  it('keeps a model’s own elements and other fields', async () => {
    const edit = await editableModel('block/own', load)
    expect(edit?.inherited).toBe(false)
    expect(edit?.json['ambientocclusion']).toBe(false)
    expect(elementsOf(edit!.json)[0]?.from).toEqual([1, 1, 1])
  })

  it('starts new elements as a valid full cube', () => {
    const json = { textures: { all: 'block/stone' }, elements: [cubeElement('#all')] }
    const range = { min: { major: 34, minor: 0 }, max: { major: 94, minor: 0 } }
    expect(checkModel(json, range).filter((i) => i.severity === 'error')).toEqual([])
  })
})
