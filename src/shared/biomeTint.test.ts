import { describe, expect, it } from 'vitest'
import {
  BIOMES,
  colormapOf,
  colormapPixel,
  DEFAULT_BIOME,
  hexToRgb,
  tintSourceForBlock
} from './biomeTint'

describe('colormapPixel', () => {
  it('puts temperature 0 / downfall 0 in the bottom-right corner', () => {
    expect(colormapPixel(0, 0)).toEqual({ x: 255, y: 255 })
  })

  it('moves left with temperature and up with downfall scaled by temperature', () => {
    expect(colormapPixel(1, 1)).toEqual({ x: 0, y: 0 })
    // Plains: t = 0.8, d = 0.4 * 0.8 = 0.32. (1 - 0.8) * 255 is 50.999… in
    // floating point, so the column is 50 — same arithmetic as the game's doubles.
    expect(colormapPixel(0.8, 0.4)).toEqual({ x: 50, y: 173 })
  })

  it('clamps out-of-range values to the nearest edge (badlands/desert t = 2)', () => {
    expect(colormapPixel(2, 0)).toEqual({ x: 0, y: 255 })
    expect(colormapPixel(-1, 5)).toEqual({ x: 255, y: 255 })
  })

  it('always samples the lower-left half (on or below the top-left → bottom-right diagonal)', () => {
    for (const biome of BIOMES) {
      const { x, y } = colormapPixel(biome.temperature, biome.downfall)
      expect(y).toBeGreaterThanOrEqual(x)
    }
  })
})

describe('tintSourceForBlock', () => {
  it('maps blocks to their colormap or fixed color', () => {
    expect(tintSourceForBlock('grass_block')).toEqual({ kind: 'colormap', colormap: 'grass' })
    expect(tintSourceForBlock('oak_leaves')).toEqual({ kind: 'colormap', colormap: 'foliage' })
    expect(tintSourceForBlock('leaf_litter')).toEqual({ kind: 'colormap', colormap: 'dry_foliage' })
    expect(tintSourceForBlock('spruce_leaves')).toEqual({ kind: 'fixed', color: '#619961' })
    expect(tintSourceForBlock('redstone_wire')).toBeNull()
  })
})

describe('biomes and colors', () => {
  it('defaults to plains and parses hex colors', () => {
    expect(DEFAULT_BIOME.id).toBe('plains')
    expect(hexToRgb('#80a755')).toEqual([128 / 255, 167 / 255, 85 / 255])
    expect(new Set(BIOMES.map((b) => b.id)).size).toBe(BIOMES.length)
  })
})

describe('colormapOf', () => {
  it('knows the three colormaps', () => {
    expect(colormapOf('assets/minecraft/textures/colormap/grass.png')).toBe('grass')
    expect(colormapOf('assets/minecraft/textures/colormap/dry_foliage.png')).toBe('dry_foliage')
    expect(colormapOf('assets/minecraft/textures/block/grass_block_top.png')).toBeNull()
  })
})
