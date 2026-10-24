import { describe, expect, it } from 'vitest'
import {
  buildRandomProperties,
  emptyRule,
  existingVariants,
  isEntityTexture,
  nextVariant,
  parseRandomProperties,
  randomPropertiesPath,
  randomVariantPath,
  ruleProblems
} from './randomEntities'

const ZOMBIE = 'assets/minecraft/textures/entity/zombie/zombie.png'

describe('random entity textures', () => {
  it('names the variants as OptiFine reads them', () => {
    expect(randomVariantPath(ZOMBIE, 2)).toBe(
      'assets/minecraft/optifine/random/entity/zombie/zombie2.png'
    )
    expect(randomVariantPath('assets/minecraft/textures/entity/warden/spots_2.png', 3)).toBe(
      'assets/minecraft/optifine/random/entity/warden/spots_2.3.png'
    )
    expect(randomPropertiesPath(ZOMBIE)).toBe(
      'assets/minecraft/optifine/random/entity/zombie/zombie.properties'
    )
    expect(isEntityTexture(ZOMBIE)).toBe(true)
    expect(isEntityTexture('assets/minecraft/textures/entity/zombie/zombie_n.png')).toBe(false)
    expect(isEntityTexture('assets/minecraft/textures/block/stone.png')).toBe(false)
  })

  it('counts the contiguous variants and numbers the next', () => {
    const files = new Set([
      'assets/minecraft/optifine/random/entity/zombie/zombie2.png',
      'assets/minecraft/optifine/random/entity/zombie/zombie3.png',
      'assets/minecraft/optifine/random/entity/zombie/zombie5.png'
    ])
    expect(existingVariants(files, ZOMBIE)).toEqual([2, 3])
    expect(nextVariant(files, ZOMBIE)).toBe(4)
    expect(nextVariant(new Set(), ZOMBIE)).toBe(2)
  })

  it('writes and reads the rules', () => {
    const rules = [
      { ...emptyRule([2, 3]), weights: [3, 1], biomes: ['desert', 'badlands'], heights: '(-3)-64' },
      { ...emptyRule([1, 2]), name: 'Bob' },
      { ...emptyRule([4]), biomes: ['jungle'], invertBiomes: true }
    ]
    const text = buildRandomProperties(rules)
    expect(text).toBe(
      'textures.1=2 3\nweights.1=3 1\nbiomes.1=desert badlands\nheights.1=(-3)-64\ntextures.2=1 2\nname.2=Bob\ntextures.3=4\nbiomes.3=!jungle\n'
    )
    expect(parseRandomProperties(text)).toEqual(rules)
    expect(parseRandomProperties('skins.1=2-4\n# comment\n')[0]?.textures).toEqual([2, 3, 4])
  })

  it('spots rules OptiFine would trip on', () => {
    expect(ruleProblems(emptyRule([]), 3)).toEqual(['empty'])
    expect(ruleProblems({ ...emptyRule([1, 2]), weights: [1] }, 3)).toEqual(['weights'])
    expect(ruleProblems(emptyRule([5]), 3)).toEqual(['missing'])
  })
})
