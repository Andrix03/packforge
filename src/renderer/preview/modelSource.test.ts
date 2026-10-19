import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cubeMesh,
  guessBlockForTexture,
  listBlocks,
  loadBlockMesh,
  resolveAssetUrl,
  type AssetSources
} from './modelSource'

const V = 'assets/minecraft'
const vanillaJson: Record<string, unknown> = {
  [`${V}/blockstates/oak_log.json`]: {
    variants: {
      'axis=x': { model: 'minecraft:block/oak_log', x: 90, y: 90 },
      'axis=y': { model: 'minecraft:block/oak_log' }
    }
  },
  [`${V}/models/block/oak_log.json`]: {
    parent: 'block/cube_column',
    textures: { end: 'block/oak_log_top', side: 'block/oak_log' }
  },
  [`${V}/models/block/cube_column.json`]: {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: {
          up: { texture: '#end' },
          down: { texture: '#end' },
          north: { texture: '#side', tintindex: 0 }
        }
      }
    ]
  }
}

function sources(packFiles: string[] = [], versions: Record<string, number> = {}): AssetSources {
  return {
    pack: { base: 'pack://p1/', files: new Set(packFiles), versions },
    vanilla: {
      base: 'pack://v2/',
      files: new Set([
        ...Object.keys(vanillaJson),
        `${V}/textures/block/oak_log.png`,
        `${V}/textures/block/oak_log_top.png`
      ])
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveAssetUrl', () => {
  it('prefers the pack (with its file version) over vanilla', () => {
    const path = `${V}/textures/block/oak_log.png`
    expect(resolveAssetUrl(sources(), path)).toBe(`pack://v2/${path}`)
    expect(resolveAssetUrl(sources([path], { [path]: 3 }), path)).toBe(`pack://p1/${path}?v=3`)
    expect(resolveAssetUrl(sources(), `${V}/textures/block/nope.png`)).toBeNull()
  })
})

describe('listBlocks / guessBlockForTexture', () => {
  it('lists block states from both sources, namespacing non-minecraft ones', () => {
    const blocks = listBlocks(sources(['assets/mymod/blockstates/ruby_block.json']))
    expect(blocks).toEqual(['mymod:ruby_block', 'oak_log'])
  })

  it('guesses the block from texture names', () => {
    const blocks = ['oak_log', 'stone', 'furnace']
    expect(guessBlockForTexture(`${V}/textures/block/oak_log_top`, blocks)).toBe('oak_log')
    expect(guessBlockForTexture(`${V}/textures/block/stone`, blocks)).toBe('stone')
    expect(guessBlockForTexture(`${V}/textures/block/furnace_front_on`, blocks)).toBeNull()
    expect(guessBlockForTexture(`${V}/textures/item/stick`, blocks)).toBeNull()
  })

  it('tries "<name>_block" for textures named after the material', () => {
    const blocks = ['magma_block', 'slime_block', 'stone']
    expect(guessBlockForTexture(`${V}/textures/block/magma`, blocks)).toBe('magma_block')
    expect(guessBlockForTexture(`${V}/textures/block/slime`, blocks)).toBe('slime_block')
    // An exact match still wins.
    expect(guessBlockForTexture(`${V}/textures/block/stone`, blocks)).toBe('stone')
  })

  it('finds the crop of a growth stage texture', () => {
    const blocks = ['wheat', 'carrots', 'torchflower_crop', 'pitcher_crop']
    expect(guessBlockForTexture(`${V}/textures/block/wheat_stage5`, blocks)).toBe('wheat')
    expect(guessBlockForTexture(`${V}/textures/block/carrots_stage0`, blocks)).toBe('carrots')
    expect(guessBlockForTexture(`${V}/textures/block/torchflower_crop_stage1`, blocks)).toBe(
      'torchflower_crop'
    )
    expect(guessBlockForTexture(`${V}/textures/block/pitcher_crop_top_stage_3`, blocks)).toBe(
      'pitcher_crop'
    )
  })
})

describe('cubeMesh', () => {
  it('puts the texture on the 6 faces of a cube', () => {
    const [part] = cubeMesh('k', 'pack://p1/a.png', null)
    expect(part?.quads).toHaveLength(6)
    expect(part?.url).toBe('pack://p1/a.png')
  })
})

describe('loadBlockMesh', () => {
  const only = (files: Record<string, unknown>): AssetSources => ({
    pack: { base: 'pack://p1/', files: new Set(), versions: {} },
    vanilla: { base: 'pack://v2/', files: new Set(Object.keys(files)) }
  })

  function stubFetch(files: Record<string, unknown>): void {
    vi.stubGlobal('fetch', async (url: string) => {
      const path = url.replace(/^pack:\/\/[pv]\d+\//, '').replace(/\?v=\d+$/, '')
      if (!(path in files)) throw new Error('404')
      return { json: async () => files[path] }
    })
  }

  it('groups quads by texture and picks the unrotated default variant', async () => {
    stubFetch(vanillaJson)
    const mesh = await loadBlockMesh(sources(), 'oak_log', null, () => [0.5, 1, 0.5])
    expect(mesh.warnings).toEqual([])
    expect(mesh.variant?.key).toBe('axis=y')
    // Without a tint function the tinted face is white and reported.
    const untinted = await loadBlockMesh(sources(), 'oak_log', null)
    expect(untinted.warnings[0]).toContain('non è simulata')
    expect(mesh.parts.map((p) => [p.url, p.quads.length])).toEqual([
      [`pack://v2/${V}/textures/block/oak_log_top.png`, 2],
      [`pack://v2/${V}/textures/block/oak_log.png`, 1]
    ])
    // The north face has tintindex 0: it gets the tint color.
    expect(mesh.parts[1]?.quads[0]?.tint).toEqual([0.5, 1, 0.5])
    expect(mesh.parts[0]?.quads[0]?.tint).toEqual([1, 1, 1])
  })

  it('uses a pack texture when the pack overrides it', async () => {
    stubFetch(vanillaJson)
    const override = `${V}/textures/block/oak_log.png`
    const mesh = await loadBlockMesh(sources([override]), 'oak_log', 'axis=x')
    expect(mesh.variant?.key).toBe('axis=x')
    expect(mesh.parts.find((p) => p.url?.includes('oak_log.png'))?.url).toBe(
      `pack://p1/${override}`
    )
  })

  it('reports unknown blocks and missing textures', async () => {
    stubFetch(vanillaJson)
    expect((await loadBlockMesh(sources(), 'nope', null)).warnings[0]).toContain('nope')
    const noTextures: AssetSources = {
      ...sources(),
      vanilla: { base: 'pack://v2/', files: new Set(Object.keys(vanillaJson)) }
    }
    const mesh = await loadBlockMesh(noTextures, 'oak_log', null)
    expect(mesh.parts.every((p) => p.url === null)).toBe(true)
  })

  it('shows the growth stage that draws the preferred texture, else the grown one', async () => {
    const crop = (stage: number): Record<string, unknown> => ({
      [`${V}/models/block/wheat_stage${stage}.json`]: {
        textures: { crop: `block/wheat_stage${stage}` },
        elements: [{ from: [4, -1, 0], to: [4, 15, 16], faces: { west: { texture: '#crop' } } }]
      }
    })
    const files = {
      [`${V}/blockstates/wheat.json`]: {
        variants: {
          'age=0': { model: 'block/wheat_stage0' },
          'age=1': { model: 'block/wheat_stage0' },
          'age=2': { model: 'block/wheat_stage1' }
        }
      },
      ...crop(0),
      ...crop(1)
    }
    stubFetch(files)
    const wheat = only(files)
    const stage1 = `${V}/textures/block/wheat_stage1.png`
    const mesh = await loadBlockMesh(wheat, 'wheat', null, undefined, stage1)
    expect(mesh.variant?.key).toBe('age=2')
    expect(mesh.stages).toEqual([
      { key: 'age=0', textures: [`${V}/textures/block/wheat_stage0.png`] },
      { key: 'age=1', textures: [`${V}/textures/block/wheat_stage0.png`] },
      { key: 'age=2', textures: [stage1] }
    ])
    const stage0 = `${V}/textures/block/wheat_stage0.png`
    expect((await loadBlockMesh(wheat, 'wheat', null, undefined, stage0)).variant?.key).toBe(
      'age=0'
    )
    expect((await loadBlockMesh(wheat, 'wheat', null)).variant?.key).toBe('age=2')
    // Not a growing block: no stages.
    stubFetch(vanillaJson)
    expect((await loadBlockMesh(sources(), 'oak_log', null)).stages).toEqual([])
  })

  it('tints growing stems by age instead of the biome', async () => {
    const files = {
      [`${V}/blockstates/melon_stem.json`]: {
        variants: { 'age=0': { model: 'block/stem' }, 'age=7': { model: 'block/stem' } }
      },
      [`${V}/models/block/stem.json`]: {
        textures: { stem: 'block/melon_stem' },
        elements: [
          { from: [0, 0, 8], to: [16, 8, 8], faces: { north: { texture: '#stem', tintindex: 0 } } }
        ]
      }
    }
    stubFetch(files)
    const young = await loadBlockMesh(only(files), 'melon_stem', 'age=0')
    expect(young.warnings).toEqual([])
    expect(young.parts[0]?.quads[0]?.tint).toEqual([0, 1, 0])
  })
})
