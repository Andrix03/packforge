import { describe, expect, it } from 'vitest'
import { canSplit, item3dPlan, splitDefinition } from './item3d'

const v = (major: number) => ({ major, minor: 0 })
const MODERN = { min: v(75), max: v(94) }

describe('2D in the inventory, 3D in hand', () => {
  it('plans the files of a top-level item texture', () => {
    expect(item3dPlan('assets/minecraft/textures/item/apple.png')).toEqual({
      flatModel: 'minecraft:item/apple',
      model3d: 'minecraft:item/apple_3d',
      model3dPath: 'assets/minecraft/models/item/apple_3d.json',
      definitionPath: 'assets/minecraft/items/apple.json'
    })
    expect(item3dPlan('assets/minecraft/textures/item/sub/apple.png')).toBeNull()
    expect(item3dPlan('assets/minecraft/textures/block/stone.png')).toBeNull()
  })

  const plan = item3dPlan('assets/minecraft/textures/item/apple.png')!

  it('splits plain items, keeping their tints', () => {
    expect(canSplit({ model: { type: 'model', model: 'item/apple' } }, plan, MODERN)).toEqual({
      ok: true,
      tints: []
    })
    const tints = [{ type: 'minecraft:dye', default: -6265536 }]
    const check = canSplit(
      { model: { type: 'minecraft:model', model: 'minecraft:item/apple', tints } },
      plan,
      MODERN
    )
    expect(check).toEqual({ ok: true, tints })
    expect(canSplit(null, plan, MODERN).ok).toBe(true)
  })

  it('refuses items that change with their state, old versions and done ones', () => {
    const bow = {
      model: {
        type: 'minecraft:condition',
        property: 'minecraft:using_item',
        on_true: { type: 'minecraft:model', model: 'minecraft:item/apple_pulling' },
        on_false: { type: 'minecraft:model', model: 'minecraft:item/apple' }
      }
    }
    expect(canSplit(bow, plan, MODERN).ok).toBe(false)
    expect(canSplit(null, plan, { min: v(34), max: v(46) }).ok).toBe(false)
    const done = splitDefinition(plan, [], MODERN)
    const again = canSplit(done, plan, MODERN)
    expect(again.ok).toBe(false)
    expect(again.ok === false && again.error).toContain('già 3D')
  })

  it('writes the vanilla spyglass layout, on_shelf only where every version knows it', () => {
    const tints = [{ type: 'minecraft:constant', value: -1 }]
    expect(splitDefinition(plan, tints, MODERN)).toEqual({
      model: {
        type: 'minecraft:select',
        property: 'minecraft:display_context',
        cases: [
          {
            when: ['gui', 'ground', 'fixed', 'on_shelf'],
            model: { type: 'minecraft:model', model: 'minecraft:item/apple', tints }
          }
        ],
        fallback: { type: 'minecraft:model', model: 'minecraft:item/apple_3d', tints }
      }
    })
    const old = splitDefinition(plan, [], { min: v(46), max: v(94) }) as {
      model: { cases: Array<{ when: string[] }> }
    }
    expect(old.model.cases[0]?.when).toEqual(['gui', 'ground', 'fixed'])
  })
})
