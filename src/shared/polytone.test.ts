import { describe, expect, it } from 'vitest'
import { colormapPixel } from './biomeTint'
import {
  generateColormap,
  isPolytoneColormap,
  polytoneColormapPath,
  polytoneModifier,
  polytoneModifierPath,
  polytoneNameProblem
} from './polytone'

const HOT: [number, number, number] = [200, 180, 60]
const COLD: [number, number, number] = [90, 130, 120]
const WET: [number, number, number] = [40, 160, 40]

describe('Polytone colormaps', () => {
  it('names the files as the wiki says', () => {
    expect(polytoneColormapPath('autumn')).toBe('assets/minecraft/polytone/colormaps/autumn.png')
    expect(polytoneModifierPath('oak_leaves')).toBe(
      'assets/minecraft/polytone/block_modifiers/oak_leaves.json'
    )
    expect(polytoneModifier('autumn')).toEqual({ colormap: 'minecraft:autumn' })
    expect(isPolytoneColormap('assets/minecraft/polytone/colormaps/autumn.png')).toBe(true)
    expect(isPolytoneColormap('assets/minecraft/textures/colormap/grass.png')).toBe(false)
    expect(polytoneNameProblem('autumn_2')).toBeNull()
    expect(polytoneNameProblem('Autumn')).not.toBeNull()
  })

  it('puts the three colours where the game samples hot, cold and wet biomes', () => {
    const map = generateColormap(HOT, COLD, WET)
    const at = (t: number, d: number) => {
      const { x, y } = colormapPixel(t, d)
      const i = (y * 256 + x) * 4
      return [map[i], map[i + 1], map[i + 2]]
    }
    expect(at(1, 0)).toEqual(HOT) // desert-like
    expect(at(0, 0)).toEqual(COLD) // frozen
    expect(at(1, 1)).toEqual(WET) // jungle-like
    expect(map.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true)
  })
})
