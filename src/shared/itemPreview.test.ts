import { describe, expect, it } from 'vitest'
import { modelsFor, parseItemDefinition } from './itemDefinition'
import {
  itemNamesFor,
  numberRange,
  resolveItemModel,
  selectValues,
  stateShowing
} from './itemPreview'

const RANGE = { min: { major: 46, minor: 0 }, max: { major: 94, minor: 0 } }

// The 26.3 bow, as in the client jar.
const BOW = {
  model: {
    type: 'minecraft:condition',
    property: 'minecraft:using_item',
    on_false: { type: 'minecraft:model', model: 'minecraft:item/bow' },
    on_true: {
      type: 'minecraft:range_dispatch',
      property: 'minecraft:use_duration',
      scale: 0.05,
      entries: [
        {
          threshold: 0.65,
          model: { type: 'minecraft:model', model: 'minecraft:item/bow_pulling_1' }
        },
        {
          threshold: 0.9,
          model: { type: 'minecraft:model', model: 'minecraft:item/bow_pulling_2' }
        }
      ],
      fallback: { type: 'minecraft:model', model: 'minecraft:item/bow_pulling_0' }
    }
  }
}

const MODELS: Record<string, unknown> = {
  'assets/minecraft/models/item/generated.json': {
    parent: 'builtin/generated',
    display: { ground: { translation: [0, 2, 0], scale: [0.5, 0.5, 0.5] } }
  },
  'assets/minecraft/models/item/handheld.json': {
    parent: 'item/generated',
    display: { ground: { translation: [0, 3, 0] } }
  },
  'assets/minecraft/models/item/bow.json': {
    parent: 'item/generated',
    textures: { layer0: 'item/bow' }
  },
  'assets/minecraft/models/item/sword.json': {
    parent: 'item/handheld',
    textures: { layer0: 'item/iron_sword', layer1: 'item/overlay' }
  },
  'assets/minecraft/models/item/cube.json': {
    textures: { all: 'block/stone' },
    elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: '#all' } } }]
  },
  'assets/minecraft/models/item/shield.json': { parent: 'builtin/entity' }
}
const load = async (path: string): Promise<unknown> => MODELS[path] ?? null

describe('item preview', () => {
  it('guesses the item of a texture from its name', () => {
    expect(itemNamesFor('assets/minecraft/textures/item/bow_pulling_0.png')).toEqual([
      'bow_pulling_0',
      'bow_pulling',
      'bow'
    ])
    expect(itemNamesFor('assets/minecraft/textures/block/stone.png')).toEqual([])
  })

  it('slides the bow through its pulling stages', () => {
    const { root } = parseItemDefinition(BOW, RANGE)
    const range = numberRange(root, 'use_duration')
    expect(range.min).toBe(0)
    expect(range.max).toBeCloseTo(22.5)
    const at = (ticks: number): string[] =>
      modelsFor(root, {
        displayContext: 'gui',
        conditions: new Set(['using_item']),
        numbers: { use_duration: ticks }
      })
    expect(at(0)).toEqual(['minecraft:item/bow_pulling_0'])
    expect(at(13)).toEqual(['minecraft:item/bow_pulling_1'])
    expect(at(20)).toEqual(['minecraft:item/bow_pulling_2'])
  })

  it('lists the values of a select property', () => {
    const { root } = parseItemDefinition(
      {
        model: {
          type: 'select',
          property: 'charge_type',
          cases: [
            { when: 'arrow', model: { type: 'model', model: 'item/a' } },
            { when: ['rocket', 'minecraft:arrow'], model: { type: 'model', model: 'item/b' } }
          ]
        }
      },
      RANGE
    )
    expect(selectValues(root, 'charge_type')).toEqual(['arrow', 'rocket'])
  })

  it('resolves flat layers with display inherited from the parents', async () => {
    const bow = await resolveItemModel('minecraft:item/bow', load)
    expect(bow.layers?.map((l) => l.id)).toEqual(['minecraft:item/bow'])
    expect(bow.display['ground']?.translation).toEqual([0, 2, 0])
    const sword = await resolveItemModel('item/sword', load)
    expect(sword.layers?.map((l) => l.id)).toEqual([
      'minecraft:item/iron_sword',
      'minecraft:item/overlay'
    ])
    // The nearest model wins: handheld's ground over generated's.
    expect(sword.display['ground']?.translation).toEqual([0, 3, 0])
  })

  it('resolves models with elements, and knows code-drawn ones', async () => {
    const cube = await resolveItemModel('item/cube', load)
    expect(cube.layers).toBeNull()
    expect(cube.elements?.elements).toHaveLength(1)
    const shield = await resolveItemModel('item/shield', load)
    expect(shield.builtin).toBe(true)
  })
})

describe('stateShowing', () => {
  it('finds the state that draws a pulling stage', () => {
    const { root } = parseItemDefinition(BOW, RANGE)
    expect(stateShowing(root, 'minecraft:item/bow', 'gui')).toEqual({
      conditions: [],
      selects: {},
      numbers: {}
    })
    expect(stateShowing(root, 'item/bow_pulling_1', 'gui')).toEqual({
      conditions: ['using_item'],
      selects: {},
      numbers: { use_duration: 13 }
    })
    expect(stateShowing(root, 'item/apple', 'gui')).toBeNull()
  })
})
