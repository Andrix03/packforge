import { describe, expect, it } from 'vitest'
import {
  BLOCK_SCENES,
  DEFAULT_NEIGHBOURS,
  HAND_SCENE,
  MINE,
  sceneBlocks,
  sceneByKind
} from './testScenes'

describe('test scenes', () => {
  it('use the tested block, never twice in the same cell', () => {
    for (const scene of BLOCK_SCENES) {
      const placements = scene.build(DEFAULT_NEIGHBOURS)
      expect(
        placements.some((p) => p.block === MINE),
        scene.kind
      ).toBe(true)
      const cells = placements.map((p) => p.at.join(','))
      expect(new Set(cells).size, scene.kind).toBe(cells.length)
      expect(
        placements.every((p) => p.at.every(Number.isInteger)),
        scene.kind
      ).toBe(true)
    }
  })

  it('put every chosen neighbour in the mixed scene', () => {
    const mixed = sceneByKind('mixed').build(['dirt', 'sand', 'gravel'])
    expect(sceneBlocks(mixed).sort()).toEqual(['dirt', 'gravel', 'sand'])
    // Without neighbours it is only the tested block.
    expect(sceneBlocks(sceneByKind('mixed').build([]))).toEqual([])
  })

  it('leave openings in the house and keep the cave hollow', () => {
    const house = sceneByKind('house').build([])
    const at = (x: number, y: number, z: number) =>
      house.find((p) => p.at[0] === x && p.at[1] === y && p.at[2] === z)?.block
    expect(at(0, 2, -3)).toBe('glass')
    expect(at(2, 1, -3)).toBeUndefined()
    expect(at(-3, 1, -3)).toBe('oak_log')
    const cave = sceneByKind('cave').build([])
    expect(cave.some((p) => p.at[0] === 0 && p.at[1] === 2 && p.at[2] === 0)).toBe(false)
    expect(sceneBlocks(cave).sort()).toEqual(['coal_ore', 'gravel'])
  })

  it('has a lawn for items and default views for every scene', () => {
    expect(sceneBlocks(HAND_SCENE.build([]))).toEqual(['grass_block'])
    expect(sceneByKind('hand')).toBe(HAND_SCENE)
    for (const scene of BLOCK_SCENES) expect(Math.hypot(...scene.camera)).toBeGreaterThan(1)
  })
})
