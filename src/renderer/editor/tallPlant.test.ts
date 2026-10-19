import { describe, expect, it } from 'vitest'
import { splitHalves, stackHalves, tallHalves } from './tallPlant'

const B = 'assets/minecraft/textures/block'

describe('tallHalves', () => {
  const pack = new Set([
    `${B}/carrots_stage3.png`,
    `${B}/carrots_stage3_top.png`,
    `${B}/carrots_stage3_v2.png`,
    `${B}/carrots_stage2.png`,
    `${B}/fire_0.png`,
    `${B}/fire_0_top.png`,
    `${B}/fire_0.png.mcmeta`
  ])
  const inPack = (path: string): boolean => pack.has(path)

  it('pairs a lower texture, its top and a variant of the lower one', () => {
    const halves = { upper: `${B}/carrots_stage3_top.png`, lower: `${B}/carrots_stage3.png` }
    expect(tallHalves(`${B}/carrots_stage3.png`, inPack)).toEqual(halves)
    expect(tallHalves(`${B}/carrots_stage3_top.png`, inPack)).toEqual(halves)
    expect(tallHalves(`${B}/carrots_stage3_v2.png`, inPack)).toEqual({
      upper: `${B}/carrots_stage3_top.png`,
      lower: `${B}/carrots_stage3_v2.png`
    })
  })

  it('is null without a top, or when a half is animated', () => {
    expect(tallHalves(`${B}/carrots_stage2.png`, inPack)).toBeNull()
    expect(tallHalves(`${B}/fire_0.png`, inPack)).toBeNull()
  })
})

describe('stackHalves / splitHalves', () => {
  it('stacks the upper half on the lower one and splits them back', () => {
    const upper = { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) }
    const lower = { width: 1, height: 2, data: new Uint8Array([5, 6, 7, 8, 9, 10, 11, 12]) }
    const stacked = stackHalves(upper, lower)!
    expect(stacked.height).toBe(3)
    expect([...stacked.data]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const { upper: u, lower: l } = splitHalves(stacked, 1)
    expect([...u]).toEqual([1, 2, 3, 4])
    expect([...l]).toEqual([5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('refuses halves of different widths', () => {
    const a = { width: 1, height: 1, data: new Uint8Array(4) }
    const b = { width: 2, height: 2, data: new Uint8Array(16) }
    expect(stackHalves(a, b)).toBeNull()
  })
})
