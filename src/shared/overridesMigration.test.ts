import { describe, expect, it } from 'vitest'
import { modelsFor, parseItemDefinition } from './itemDefinition'
import { migrateOverrides } from './overridesMigration'

const RANGE = { min: { major: 46, minor: 0 }, max: { major: 94, minor: 0 } }

function draw(
  definition: unknown,
  situation: { conditions?: string[]; numbers?: Record<string, number> } = {}
): string[] {
  const { root, issues } = parseItemDefinition(definition, RANGE)
  expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  return modelsFor(root, {
    displayContext: 'gui',
    conditions: new Set(situation.conditions ?? []),
    numbers: situation.numbers ?? {}
  })
}

describe('overrides → item definition', () => {
  it('converts custom model data, the last matching override winning', () => {
    const sword = {
      parent: 'item/handheld',
      textures: { layer0: 'item/diamond_sword' },
      overrides: [
        { predicate: { custom_model_data: 1 }, model: 'item/ruby_sword' },
        { predicate: { custom_model_data: 2 }, model: 'custom:item/fire_sword' }
      ]
    }
    const result = migrateOverrides('minecraft:diamond_sword', sword)
    expect(result.converted).toBe(2)
    const at = (cmd: number) => draw(result.definition, { numbers: { custom_model_data: cmd } })
    expect(at(0)).toEqual(['minecraft:item/diamond_sword'])
    expect(at(1)).toEqual(['minecraft:item/ruby_sword'])
    expect(at(2)).toEqual(['custom:item/fire_sword'])
    expect(at(7)).toEqual(['custom:item/fire_sword'])
  })

  it('converts the 1.21.3 bow (pulling + pull) to using_item and use time', () => {
    const bow = {
      parent: 'item/generated',
      overrides: [
        { predicate: { pulling: 1 }, model: 'item/bow_pulling_0' },
        { predicate: { pulling: 1, pull: 0.65 }, model: 'item/bow_pulling_1' },
        { predicate: { pulling: 1, pull: 0.9 }, model: 'item/bow_pulling_2' }
      ]
    }
    const { definition } = migrateOverrides('minecraft:bow', bow)
    const pulling = (ticks: number) =>
      draw(definition, { conditions: ['using_item'], numbers: { use_duration: ticks } })
    expect(draw(definition)).toEqual(['minecraft:item/bow'])
    expect(pulling(0)).toEqual(['minecraft:item/bow_pulling_0'])
    expect(pulling(14)).toEqual(['minecraft:item/bow_pulling_1'])
    expect(pulling(19)).toEqual(['minecraft:item/bow_pulling_2'])
  })

  it('keeps the vanilla definition as fallback, lends its tints, skips the unknown', () => {
    const vanilla = {
      type: 'minecraft:select',
      property: 'minecraft:trim_material',
      cases: [],
      fallback: {
        type: 'minecraft:model',
        model: 'minecraft:item/leather_helmet',
        tints: [{ type: 'minecraft:dye', default: -6265536 }]
      }
    }
    const helmet = {
      overrides: [
        { predicate: { custom_model_data: 3 }, model: 'item/crown' },
        { predicate: { trim_type: 0.5 }, model: 'item/helmet_trim' }
      ]
    }
    const result = migrateOverrides('minecraft:leather_helmet', helmet, vanilla)
    expect(result.converted).toBe(1)
    expect(result.skipped).toHaveLength(1)
    const root = (result.definition as { model: Record<string, unknown> }).model
    expect(root['fallback']).toBe(vanilla)
    expect((root['entries'] as Array<{ model: { tints: unknown } }>)[0]?.model.tints).toEqual([
      { type: 'minecraft:dye', default: -6265536 }
    ])
  })

  it('has nothing to write without overrides', () => {
    expect(migrateOverrides('minecraft:apple', { parent: 'item/generated' }).definition).toBeNull()
  })
})
