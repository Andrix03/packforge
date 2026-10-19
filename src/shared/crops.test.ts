import { describe, expect, it } from 'vitest'
import type { BlockstateVariant } from './blockModel'
import { growthVariants, stageBaseNames, stateValue, stemTint } from './crops'

const variant = (key: string): BlockstateVariant => ({
  key,
  models: [{ model: `block/${key}`, x: 0, y: 0, uvlock: false }]
})

describe('stateValue', () => {
  it('reads one state of a variant key', () => {
    expect(stateValue('age=3,facing=north', 'age')).toBe('3')
    expect(stateValue('age=3,facing=north', 'facing')).toBe('north')
    expect(stateValue('', 'age')).toBeNull()
  })
})

describe('growthVariants', () => {
  it('sorts the ages numerically (age=10 after age=2)', () => {
    const variants = ['age=10', 'age=2', 'age=0'].map(variant)
    expect(growthVariants(variants, null).map((v) => v.key)).toEqual(['age=0', 'age=2', 'age=10'])
  })

  it('keeps the other states of the base variant (cocoa facing one way)', () => {
    const variants = [
      'age=0,facing=north',
      'age=0,facing=south',
      'age=1,facing=north',
      'age=1,facing=south'
    ].map(variant)
    expect(growthVariants(variants, variants[1]!).map((v) => v.key)).toEqual([
      'age=0,facing=south',
      'age=1,facing=south'
    ])
    // Without a base: the first combination found.
    expect(growthVariants(variants, null).map((v) => v.key)).toEqual([
      'age=0,facing=north',
      'age=1,facing=north'
    ])
  })

  it('is empty for blocks that do not grow (or have a single age)', () => {
    expect(growthVariants(['axis=x', 'axis=y'].map(variant), null)).toEqual([])
    expect(growthVariants([variant('age=0')], null)).toEqual([])
  })
})

describe('stemTint', () => {
  it('matches the wiki table: #00FF00 at age 0, #E0C71C at age 7', () => {
    const hex = (rgb: number[]): string =>
      rgb
        .map((c) =>
          Math.round(c * 255)
            .toString(16)
            .padStart(2, '0')
        )
        .join('')
    expect(hex(stemTint('pumpkin_stem', 'age=0')!)).toBe('00ff00')
    expect(hex(stemTint('melon_stem', 'age=3')!)).toBe('60e70c')
    expect(hex(stemTint('melon_stem', 'age=7')!)).toBe('e0c71c')
  })

  it('is null for other blocks', () => {
    expect(stemTint('wheat', 'age=7')).toBeNull()
  })
})

describe('stageBaseNames', () => {
  it('strips the stage number (with or without underscore) and top/bottom', () => {
    expect(stageBaseNames('wheat_stage3')).toEqual(['wheat'])
    expect(stageBaseNames('torchflower_crop_stage1')).toEqual(['torchflower_crop'])
    expect(stageBaseNames('pitcher_crop_bottom_stage_2')).toEqual([
      'pitcher_crop_bottom',
      'pitcher_crop'
    ])
  })

  it('ignores textures without a stage', () => {
    expect(stageBaseNames('stone')).toEqual([])
    expect(stageBaseNames('destroy_stage_')).toEqual([])
  })
})
