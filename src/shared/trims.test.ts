import { describe, expect, it } from 'vitest'
import { armorMaterialOf, trimChoices, trimMaterialOf, trimPalette, trimPatternOf } from './trims'

const T = 'assets/minecraft/textures/'

describe('trims', () => {
  it('recognises patterns and palettes, old and new', () => {
    expect(trimPatternOf(`${T}trims/entity/humanoid/bolt.png`)).toEqual({
      layer: 'humanoid',
      name: 'bolt'
    })
    expect(trimPatternOf(`${T}trims/entity/humanoid_leggings/bolt.png`)?.layer).toBe(
      'humanoid_leggings'
    )
    expect(trimPatternOf(`${T}trims/items/boots_trim.png`)).toBeNull()
    expect(trimMaterialOf(`${T}palettes/trim/gold.png`)).toBe('gold')
    expect(trimMaterialOf(`${T}trims/color_palettes/amethyst.png`)).toBe('amethyst')
    expect(trimMaterialOf(`${T}trims/color_palettes/trim_palette.png`)).toBeNull()
    expect(trimMaterialOf(`${T}palettes/trim_base.png`)).toBeNull()
    expect(armorMaterialOf(`${T}entity/equipment/humanoid/gold.png`)).toBe('gold')
  })

  it('lists what can be combined on a layer, pack first, new palettes first', () => {
    const choices = trimChoices(
      [
        `${T}trims/entity/humanoid/wild.png`,
        `${T}trims/entity/humanoid/bolt.png`,
        `${T}trims/entity/humanoid_leggings/bolt.png`,
        `${T}trims/color_palettes/gold.png`,
        `${T}palettes/trim/gold.png`,
        `${T}palettes/trim/gold_darker.png`,
        `${T}trims/color_palettes/lapis.png`,
        `${T}entity/equipment/humanoid/iron.png`,
        `${T}entity/equipment/humanoid_leggings/iron.png`
      ],
      'humanoid'
    )
    expect([...choices.patterns.keys()]).toEqual(['bolt', 'wild'])
    expect([...choices.materials.keys()]).toEqual(['gold', 'lapis'])
    expect(choices.materials.get('gold')).toBe(`${T}palettes/trim/gold.png`)
    expect(choices.armors.get('iron')).toBe(`${T}entity/equipment/humanoid/iron.png`)
  })

  it('uses the darker palette on armor of the same material', () => {
    const palettes = new Map([
      ['gold', 'g'],
      ['gold_darker', 'gd'],
      ['lapis', 'l']
    ])
    expect(trimPalette(palettes, 'gold', 'gold')).toBe('gd')
    expect(trimPalette(palettes, 'gold', 'iron')).toBe('g')
    expect(trimPalette(palettes, 'lapis', 'lapis')).toBe('l')
    expect(trimPalette(palettes, 'emerald', null)).toBeNull()
  })
})
