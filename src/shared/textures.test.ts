import { describe, expect, it } from 'vitest'
import { groupTextures } from './textures'

const BLOCK = 'assets/minecraft/textures/block'

describe('groupTextures', () => {
  it('attaches _n, _s and .png.mcmeta to their base texture', () => {
    const textures = groupTextures([
      `${BLOCK}/stone.png`,
      `${BLOCK}/stone_n.png`,
      `${BLOCK}/stone_s.png`,
      `${BLOCK}/magma.png`,
      `${BLOCK}/magma.png.mcmeta`,
      `${BLOCK}/magma_s.png`
    ])
    expect(textures).toEqual([
      {
        key: `${BLOCK}/stone`,
        folder: BLOCK,
        name: 'stone',
        albedo: `${BLOCK}/stone.png`,
        normal: `${BLOCK}/stone_n.png`,
        specular: `${BLOCK}/stone_s.png`,
        mcmeta: null
      },
      {
        key: `${BLOCK}/magma`,
        folder: BLOCK,
        name: 'magma',
        albedo: `${BLOCK}/magma.png`,
        normal: null,
        specular: `${BLOCK}/magma_s.png`,
        mcmeta: `${BLOCK}/magma.png.mcmeta`
      }
    ])
  })

  it('treats _n/_s files without a base texture as textures of their own', () => {
    const textures = groupTextures([`${BLOCK}/orphan_n.png`, `${BLOCK}/glass_pane_s.png`])
    expect(textures.map((t) => [t.name, t.normal, t.specular])).toEqual([
      ['orphan_n', null, null],
      ['glass_pane_s', null, null]
    ])
  })

  it('only pairs maps in the same folder', () => {
    const textures = groupTextures([
      `${BLOCK}/stone.png`,
      'assets/minecraft/textures/item/stone_n.png'
    ])
    expect(textures).toHaveLength(2)
    expect(textures[0]?.normal).toBeNull()
  })

  it('ignores non-PNG files and the pack icon, handles root-level textures', () => {
    const textures = groupTextures(['pack.mcmeta', 'pack.png', 'readme.txt', 'logo.png'])
    expect(textures.map((t) => [t.key, t.folder, t.name])).toEqual([['logo', '', 'logo']])
  })

  it('accepts upper-case extensions', () => {
    const textures = groupTextures([`${BLOCK}/dirt.PNG`, `${BLOCK}/dirt_n.PNG`])
    expect(textures).toHaveLength(1)
    expect(textures[0]?.normal).toBe(`${BLOCK}/dirt_n.PNG`)
  })
})
