import { describe, expect, it } from 'vitest'
import { pickChoice, variantModel, variantNames, withRandomModels } from './randomVariants'

describe('pickChoice', () => {
  it('always gives the same block the same choice', () => {
    expect(pickChoice([1, 1, 1], [3, 1, -7])).toBe(pickChoice([1, 1, 1], [3, 1, -7]))
  })

  it('spreads choices by weight over a field', () => {
    const counts = [0, 0, 0]
    for (let x = -20; x < 20; x++)
      for (let z = -20; z < 20; z++) counts[pickChoice([2, 1, 1], [x, 1, z])]!++
    // 1600 blocks: about 800 / 400 / 400.
    expect(counts[0]).toBeGreaterThan(700)
    expect(counts[0]).toBeLessThan(900)
    expect(counts[1]).toBeGreaterThan(320)
    expect(counts[2]).toBeGreaterThan(320)
  })

  it('handles one choice and zero or bad weights', () => {
    expect(pickChoice([5], [1, 2, 3])).toBe(0)
    expect(pickChoice([0, 0], [1, 2, 3])).toBe(0)
    expect(pickChoice([0, 3], [1, 2, 3])).toBe(1)
  })
})

describe('variantModel', () => {
  it('overrides the variables pointing at the base texture, parented to the base model', () => {
    const base = {
      parent: 'block/crop',
      textures: { crop: 'block/wheat_stage7', particle: '#crop' }
    }
    expect(
      variantModel('block/wheat_stage7', base, 'block/wheat_stage7', 'block/wheat_stage7_v2')
    ).toEqual({
      parent: 'minecraft:block/wheat_stage7',
      textures: { crop: 'minecraft:block/wheat_stage7_v2' }
    })
  })

  it('reads 26.1 sprite objects and refuses models without the texture', () => {
    const sprite = {
      textures: { all: { sprite: 'minecraft:block/glass', force_translucent: true } }
    }
    expect(
      variantModel('block/glass', sprite, 'block/glass', 'block/glass_v2')?.['textures']
    ).toEqual({
      all: 'minecraft:block/glass_v2'
    })
    expect(variantModel('block/x', { parent: 'block/y' }, 'block/x', 'block/x_v2')).toBeNull()
  })
})

describe('withRandomModels', () => {
  const carrots = {
    variants: {
      'age=6': { model: 'minecraft:block/carrots_stage2' },
      'age=7': { model: 'minecraft:block/carrots_stage3' }
    }
  }

  it('turns the variants of the base model into a pick among the models', () => {
    const { json, changed } = withRandomModels(
      carrots,
      'block/carrots_stage3',
      ['block/carrots_stage3_v2'],
      false
    )
    expect(changed).toEqual(['age=7'])
    expect((json['variants'] as Record<string, unknown>)['age=7']).toEqual([
      { model: 'minecraft:block/carrots_stage3' },
      { model: 'minecraft:block/carrots_stage3_v2' }
    ])
    // Untouched variants and the input stay as they were.
    expect((json['variants'] as Record<string, unknown>)['age=6']).toEqual(
      carrots.variants['age=6']
    )
    expect(carrots.variants['age=7']).toEqual({ model: 'minecraft:block/carrots_stage3' })
  })

  it('adds the four Y rotations, keeps x/uvlock, and appends to an existing list once', () => {
    const state = { variants: { '': { model: 'block/a', x: 90, uvlock: true } } }
    const { json } = withRandomModels(state, 'block/a', ['block/c'], true)
    const list = (json['variants'] as Record<string, unknown[]>)['']!
    expect(list).toHaveLength(8)
    expect(list[1]).toEqual({ x: 90, uvlock: true, model: 'minecraft:block/a', y: 90 })
    expect(list[4]).toEqual({ x: 90, uvlock: true, model: 'minecraft:block/c' })
    // A list gets the new model appended, its own entries untouched.
    const listed = { variants: { '': [{ model: 'block/a' }, { model: 'block/b', weight: 3 }] } }
    expect(
      (
        withRandomModels(listed, 'block/a', ['block/c'], false).json['variants'] as Record<
          string,
          unknown
        >
      )['']
    ).toEqual([
      { model: 'block/a' },
      { model: 'block/b', weight: 3 },
      // As likely as the whole original pick (1 + 3).
      { model: 'minecraft:block/c', weight: 4 }
    ])
    const again = withRandomModels(json, 'block/a', ['block/c'], false)
    expect(again.changed).toEqual([])
    expect(again.json).toEqual(json)
  })

  it('a vanilla stone-like list: each new texture as likely as the original one', () => {
    const stone = {
      variants: {
        '': [
          { model: 'minecraft:block/stone' },
          { model: 'minecraft:block/stone_mirrored' },
          { model: 'minecraft:block/stone', y: 180 },
          { model: 'minecraft:block/stone_mirrored', y: 180 }
        ]
      }
    }
    const once = withRandomModels(stone, 'block/stone', ['block/stone_v2'], false).json
    const list = (once['variants'] as Record<string, Array<{ model: string; weight?: number }>>)[
      ''
    ]!
    expect(list.at(-1)).toEqual({ model: 'minecraft:block/stone_v2', weight: 4 })
    // A later third texture: the earlier copy does not count as part of the original group.
    const twice = withRandomModels(once, 'block/stone', ['block/stone_v3'], true).json
    const all = (twice['variants'] as Record<string, Array<{ model: string; weight?: number }>>)[
      ''
    ]!
    const share = (model: string) =>
      all.filter((e) => e.model.startsWith(model)).reduce((sum, e) => sum + (e.weight ?? 1), 0)
    expect(share('minecraft:block/stone_v3')).toBe(share('minecraft:block/stone_v2'))
    expect(all.filter((e) => e.model === 'minecraft:block/stone_v3')).toHaveLength(4)
  })

  it('leaves multipart block states alone', () => {
    const multipart = { multipart: [{ apply: { model: 'block/a' } }] }
    expect(withRandomModels(multipart, 'block/a', ['block/b'], false).changed).toEqual([])
  })
})

describe('variantNames', () => {
  it('numbers from _v2, skipping names already taken', () => {
    expect(variantNames('wheat_stage7', 2, new Set(['wheat_stage7_v2']))).toEqual([
      'wheat_stage7_v3',
      'wheat_stage7_v4'
    ])
  })
})
