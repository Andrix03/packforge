import { describe, expect, it } from 'vitest'
import { variantPairs } from './variantPairs'

const I = 'assets/minecraft/textures/item/'
const B = 'assets/minecraft/textures/block/'

describe('variantPairs', () => {
  it('pairs name and random variants with their original', () => {
    expect(
      variantPairs([
        `${I}iron_sword.png`,
        `${I}iron_sword_spada_di_prova.png`,
        `${B}dirt.png`,
        `${B}dirt_v2.png`,
        `${B}stone.png`
      ])
    ).toEqual([
      [`${B}dirt_v2.png`, `${B}dirt.png`],
      [`${I}iron_sword_spada_di_prova.png`, `${I}iron_sword.png`]
    ])
  })

  it('leaves out the LabPBR and emissive maps and other folders', () => {
    expect(
      variantPairs([`${B}stone.png`, `${B}stone_n.png`, `${B}stone_s.png`, `${B}glowstone_e.png`])
    ).toEqual([])
    expect(variantPairs([`${B}dirt.png`, `${I}dirt_v2.png`])).toEqual([])
  })

  it('picks the closest original', () => {
    const pairs = variantPairs([`${B}oak.png`, `${B}oak_log.png`, `${B}oak_log_top.png`])
    expect(new Map(pairs)).toEqual(
      new Map([
        [`${B}oak_log.png`, `${B}oak.png`],
        [`${B}oak_log_top.png`, `${B}oak_log.png`]
      ])
    )
  })
})
