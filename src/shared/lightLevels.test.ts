import { describe, expect, it } from 'vitest'
import {
  brightness,
  cornerLight,
  LightGrid,
  lightPropsFor,
  type LitBlock,
  type Vec3
} from './lightLevels'

const stone = lightPropsFor('stone', true)
const solid = (at: Vec3): LitBlock => ({ at, light: stone })

describe('lightPropsFor', () => {
  it('tells opaque blocks, see-through full cubes and light sources apart', () => {
    expect(stone).toEqual({ opaque: true, fullShape: true, filtersSky: false, emission: 0 })
    expect(lightPropsFor('glass', true)).toMatchObject({ opaque: false, fullShape: true })
    expect(lightPropsFor('oak_leaves', true)).toMatchObject({ opaque: false, filtersSky: true })
    expect(lightPropsFor('minecraft:glowstone', true)).toMatchObject({ opaque: true, emission: 15 })
    expect(lightPropsFor('torch', false)).toMatchObject({ opaque: false, emission: 14 })
    expect(lightPropsFor('oak_slab', false)).toMatchObject({ opaque: false, fullShape: false })
  })
})

describe('brightness', () => {
  it('follows the game lightmap curve', () => {
    expect(brightness(15)).toBe(1)
    expect(brightness(0)).toBe(0)
    // 7/15 / (4 − 3·7/15) = 7/39
    expect(brightness(7)).toBeCloseTo(7 / 39, 10)
  })
})

describe('LightGrid', () => {
  it('lets sky light fall straight down and stops it at a roof', () => {
    // A 5×5 roof at y = 3 over the origin.
    const roof: LitBlock[] = []
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) roof.push(solid([x, 3, z]))
    const grid = new LightGrid(roof)
    expect(grid.skyAt(0, 10, 0)).toBe(15)
    expect(grid.skyAt(0, 3, 0)).toBe(0)
    // Under the middle of the roof: light comes in from the sides, 1 less per block.
    expect(grid.skyAt(0, 2, 0)).toBe(12)
    expect(grid.skyAt(2, 2, 0)).toBe(14)
    expect(grid.skyAt(3, 2, 0)).toBe(15)
  })

  it('takes 1 more sky light through leaves', () => {
    const grid = new LightGrid([{ at: [0, 1, 0], light: lightPropsFor('oak_leaves', true) }])
    expect(grid.skyAt(0, 1, 0)).toBe(14)
  })

  it('spreads block light 1 less per block (taxicab) and not through walls', () => {
    const grid = new LightGrid([
      { at: [0, 0, 0], light: lightPropsFor('torch', false) },
      solid([2, 0, 0])
    ])
    expect(grid.blockAt(0, 0, 0)).toBe(14)
    expect(grid.blockAt(1, 0, 0)).toBe(13)
    expect(grid.blockAt(1, 0, 1)).toBe(12)
    expect(grid.blockAt(2, 0, 0)).toBe(0)
    // Around the wall (over it): 5 steps.
    expect(grid.blockAt(3, 0, 0)).toBe(9)
  })
})

describe('cornerLight', () => {
  it('is full light on a lone block', () => {
    const grid = new LightGrid([solid([0, 0, 0])])
    expect(cornerLight(grid, [0, 0, 0], [0, 1, 0], [0, 16, 0], true)).toEqual({
      sky: 15,
      block: 0,
      ao: 1
    })
  })

  it('darkens corners next to blocks like smooth lighting', () => {
    // Floor with a wall block on top at x = 1: the floor's top corners at x = 16 touch it.
    const grid = new LightGrid([solid([0, 0, 0]), solid([1, 0, 0]), solid([1, 1, 0])])
    const near = cornerLight(grid, [0, 0, 0], [0, 1, 0], [16, 16, 16], true)
    const far = cornerLight(grid, [0, 0, 0], [0, 1, 0], [0, 16, 16], true)
    expect(far.ao).toBe(1)
    // One edge is a full block: (0.2 + 1 + 1 + 1) / 4.
    expect(near.ao).toBeCloseTo(0.8, 10)
    // In a corner between two walls the diagonal is skipped: (0.2 + 0.2 + 0.2 + 1) / 4.
    const corner = new LightGrid([solid([0, 0, 0]), solid([1, 1, 0]), solid([0, 1, 1])])
    expect(cornerLight(corner, [0, 0, 0], [0, 1, 0], [16, 16, 16], true).ao).toBeCloseTo(0.4, 10)
  })

  it('raises the zero light of opaque neighbours instead of averaging it in', () => {
    const grid = new LightGrid([solid([0, 0, 0]), solid([1, 1, 0])])
    expect(cornerLight(grid, [0, 0, 0], [0, 1, 0], [16, 16, 16], true).sky).toBe(15)
  })

  it('uses the own cell for faces inside the block and for tilted faces', () => {
    const grid = new LightGrid([{ at: [0, 0, 0], light: lightPropsFor('torch', false) }])
    expect(cornerLight(grid, [0, 0, 0], [0.7, 0, 0.7], [8, 8, 8], false)).toEqual({
      sky: 15,
      block: 14,
      ao: 1
    })
  })
})
