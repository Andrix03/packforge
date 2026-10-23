import { describe, expect, it } from 'vitest'
import {
  BLOCK_SCENES,
  DEFAULT_NEIGHBOURS,
  HAND_SCENE,
  MINE,
  oreHost,
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
    expect(sceneBlocks(cave).sort()).toEqual(['coal_ore', 'gravel', 'torch'])
  })

  it('puts an ore in its rock in the cave, here and there like a mine', () => {
    expect(oreHost('diamond_ore')).toBe('stone')
    expect(oreHost('deepslate_iron_ore')).toBe('deepslate')
    expect(oreHost('assets/minecraft/textures/block/nether_gold_ore.png')).toBe('netherrack')
    expect(oreHost('ancient_debris')).toBe('netherrack')
    expect(oreHost('stone')).toBeNull()
    const cave = sceneByKind('cave').build([], 'diamond_ore')
    const walls = cave.filter((p) => p.block !== 'torch' && p.block !== 'gravel')
    const ore = walls.filter((p) => p.block === MINE).length
    expect(sceneBlocks(cave).sort()).toEqual(['gravel', 'stone', 'torch'])
    // Mostly stone, the ore a sixth or so of the walls, and the end wall shows it up close.
    expect(ore / walls.length).toBeGreaterThan(0.1)
    expect(ore / walls.length).toBeLessThan(0.3)
    expect(cave.find((p) => p.at[0] === 0 && p.at[1] === 2 && p.at[2] === -9)?.block).toBe(MINE)
  })

  it('grows the crop rows from seed (front) to ripe (back) on moist farmland', () => {
    const farm = sceneByKind('farm').build([])
    const crops = farm.filter((p) => p.block === MINE)
    expect(crops).toHaveLength(49)
    expect(crops.every((p) => p.at[1] === 1)).toBe(true)
    expect(crops.find((p) => p.at[2] === 3)?.growth).toBe(0)
    expect(crops.find((p) => p.at[2] === -3)?.growth).toBe(1)
    const soil = farm.find((p) => p.at.join(',') === '0,0,0')
    expect(soil).toEqual({ block: 'farmland', variant: 'moisture=7', at: [0, 0, 0] })
  })

  it('has a lawn for items and default views for every scene', () => {
    expect(sceneBlocks(HAND_SCENE.build([]))).toEqual(['grass_block'])
    expect(sceneByKind('hand')).toBe(HAND_SCENE)
    for (const scene of BLOCK_SCENES) expect(Math.hypot(...scene.camera)).toBeGreaterThan(1)
  })
})
