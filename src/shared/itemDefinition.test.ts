import { describe, expect, it } from 'vitest'
import { itemProperties, modelsFor, parseItemDefinition } from './itemDefinition'
import type { FormatRange } from './modelRules'

const ONLY_26_3: FormatRange = { min: { major: 97, minor: 1 }, max: { major: 97, minor: 1 } }
const FROM_1_21_4: FormatRange = { min: { major: 46, minor: 0 }, max: { major: 97, minor: 1 } }

// Shaped like the game's bow: pulling models while in use, by pull progress.
const BOW = {
  model: {
    type: 'minecraft:condition',
    property: 'minecraft:using_item',
    on_false: { type: 'minecraft:model', model: 'minecraft:item/bow' },
    on_true: {
      type: 'minecraft:range_dispatch',
      property: 'minecraft:use_duration',
      scale: 0.05,
      fallback: { type: 'minecraft:model', model: 'minecraft:item/bow_pulling_0' },
      entries: [
        {
          threshold: 0.9,
          model: { type: 'minecraft:model', model: 'minecraft:item/bow_pulling_2' }
        },
        {
          threshold: 0.65,
          model: { type: 'minecraft:model', model: 'minecraft:item/bow_pulling_1' }
        }
      ]
    }
  }
}

describe('parseItemDefinition', () => {
  it('reads a definition without issues', () => {
    expect(parseItemDefinition(BOW, ONLY_26_3).issues).toEqual([])
  })

  it('reports unknown and version-gated types', () => {
    const unknown = parseItemDefinition({ model: { type: 'minecraft:spinning' } }, ONLY_26_3)
    expect(unknown.issues[0]?.message).toContain('sconosciuto')
    const bed = {
      model: { type: 'minecraft:special', base: 'item/bed', model: { type: 'minecraft:bed' } }
    }
    expect(parseItemDefinition(bed, ONLY_26_3).issues[0]?.message).toContain('non esiste più')
    expect(
      parseItemDefinition(bed, { min: FROM_1_21_4.min, max: { major: 84, minor: 0 } }).issues
    ).toEqual([])
    const bell = {
      model: { type: 'minecraft:special', base: 'item/bell', model: { type: 'minecraft:bell' } }
    }
    expect(parseItemDefinition(bell, FROM_1_21_4).issues[0]?.message).toContain('26.1')
  })

  it('warns about root fields older versions ignore', () => {
    const big = { ...BOW, oversized_in_gui: true }
    expect(parseItemDefinition(big, FROM_1_21_4).issues[0]).toMatchObject({ severity: 'warning' })
    expect(parseItemDefinition(big, ONLY_26_3).issues).toEqual([])
  })
})

describe('modelsFor', () => {
  const root = parseItemDefinition(BOW, ONLY_26_3).root

  it('follows conditions and range dispatch like the game', () => {
    expect(modelsFor(root, { displayContext: 'gui' })).toEqual(['minecraft:item/bow'])
    const pulling = (ticks: number) =>
      modelsFor(root, {
        displayContext: 'firstperson_righthand',
        conditions: new Set(['using_item']),
        numbers: { use_duration: ticks }
      })
    expect(pulling(5)).toEqual(['minecraft:item/bow_pulling_0'])
    expect(pulling(14)).toEqual(['minecraft:item/bow_pulling_1'])
    expect(pulling(20)).toEqual(['minecraft:item/bow_pulling_2'])
  })

  it('selects on the display context ("2D in the inventory, 3D in hand")', () => {
    const json = {
      model: {
        type: 'minecraft:select',
        property: 'minecraft:display_context',
        cases: [
          {
            when: ['gui', 'ground', 'fixed'],
            model: { type: 'minecraft:model', model: 'item/sword' }
          }
        ],
        fallback: { type: 'minecraft:model', model: 'item/sword_3d' }
      }
    }
    const parsed = parseItemDefinition(json, ONLY_26_3).root
    expect(modelsFor(parsed, { displayContext: 'gui' })).toEqual(['item/sword'])
    expect(modelsFor(parsed, { displayContext: 'firstperson_righthand' })).toEqual([
      'item/sword_3d'
    ])
    expect(itemProperties(parsed).selects).toEqual(['display_context'])
  })

  it('lists the properties a preview can switch', () => {
    expect(itemProperties(root)).toEqual({
      conditions: ['using_item'],
      selects: [],
      numbers: ['use_duration']
    })
  })
})
