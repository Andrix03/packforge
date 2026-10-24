import { describe, expect, it } from 'vitest'
import {
  nameVariantPlan,
  namedVariants,
  variantModel,
  variantSlug,
  withNameCase
} from './nameVariant'

describe('variant by name', () => {
  it('turns a name into file names', () => {
    expect(variantSlug('Excalibur II')).toBe('excalibur_ii')
    expect(variantSlug('  Città   d’oro! ')).toBe('citta_d_oro')
    expect(variantSlug('!!!')).toBeNull()
    expect(nameVariantPlan('minecraft:diamond_sword', ' Excalibur ')).toEqual({
      name: 'Excalibur',
      id: 'minecraft:item/diamond_sword_excalibur',
      texturePath: 'assets/minecraft/textures/item/diamond_sword_excalibur.png',
      modelPath: 'assets/minecraft/models/item/diamond_sword_excalibur.json'
    })
  })

  it('copies the item model with the new texture', () => {
    const sword = {
      parent: 'minecraft:item/handheld',
      textures: { layer0: 'minecraft:item/diamond_sword' }
    }
    expect(variantModel(sword, 'item/diamond_sword', 'minecraft:item/diamond_sword_x')).toEqual({
      parent: 'minecraft:item/handheld',
      textures: { layer0: 'minecraft:item/diamond_sword_x' }
    })
    expect(variantModel(null, 'item/a', 'item/a_x')).toEqual({
      parent: 'minecraft:item/generated',
      textures: { layer0: 'item/a_x' }
    })
  })

  it('wraps the definition, then adds or replaces cases', () => {
    const plain = { model: { type: 'minecraft:model', model: 'minecraft:item/diamond_sword' } }
    const one = withNameCase(plain, 'Excalibur', 'item/sword_excalibur', 'item/diamond_sword')
    expect(one).toEqual({
      model: {
        type: 'minecraft:select',
        property: 'minecraft:component',
        component: 'minecraft:custom_name',
        cases: [
          { when: 'Excalibur', model: { type: 'minecraft:model', model: 'item/sword_excalibur' } }
        ],
        fallback: plain.model
      }
    })
    const two = withNameCase(one, 'Mjolnir', 'item/sword_mjolnir', 'item/diamond_sword')
    const again = withNameCase(two, 'Excalibur', 'item/sword_excalibur2', 'item/diamond_sword')
    expect(namedVariants(again)).toEqual([
      { name: 'Mjolnir', model: 'item/sword_mjolnir' },
      { name: 'Excalibur', model: 'item/sword_excalibur2' }
    ])
    // No definition yet: the item's own model is the fallback.
    const fresh = withNameCase(null, 'A', 'item/x_a', 'minecraft:item/x') as {
      model: { fallback: unknown }
    }
    expect(fresh.model.fallback).toEqual({ type: 'minecraft:model', model: 'minecraft:item/x' })
  })
})
