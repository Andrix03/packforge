import { describe, expect, it } from 'vitest'
import {
  alphaTestCoverage,
  gameMipLevels,
  mipOptionsFromMcmeta,
  solidify,
  type MipImage,
  type MipOptions
} from './mipmaps'

const AUTO: MipOptions = { strategy: 'auto', alphaCutoffBias: 0, item: false }

/** An image from rows of pixels ([r, g, b, a]). */
function image(rows: number[][][]): MipImage {
  const height = rows.length
  const width = rows[0]!.length
  const data = new Uint8Array(width * height * 4)
  rows.flat().forEach((pixel, i) => data.set(pixel, i * 4))
  return { width, height, data }
}

const CLEAR = [0, 0, 0, 0]
const GREEN = [40, 160, 40, 255]
const RED = [200, 20, 20, 255]

/** A 1-pixel green stem down the middle of a transparent 4×4 texture. */
const STEM = image([
  [CLEAR, GREEN, CLEAR, CLEAR],
  [CLEAR, GREEN, CLEAR, CLEAR],
  [CLEAR, GREEN, CLEAR, CLEAR],
  [CLEAR, GREEN, CLEAR, CLEAR]
])

describe('solidify', () => {
  it('gives see-through pixels the color of the nearest visible one, alpha untouched', () => {
    const img = image([[RED, CLEAR, CLEAR, GREEN]])
    solidify(img)
    expect([...img.data]).toEqual([...RED, 200, 20, 20, 0, 40, 160, 40, 0, ...GREEN])
  })

  it('leaves a fully transparent texture alone', () => {
    const img = image([[CLEAR, CLEAR]])
    solidify(img)
    expect([...img.data]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })
})

describe('gameMipLevels', () => {
  it('keeps a cutout plant green at distance (no black fringe)', () => {
    const [, level1] = gameMipLevels(STEM, 1, AUTO)
    expect(level1!.width).toBe(2)
    // Every level-1 pixel that covers the stem is pure green, not darkened by the empty pixels.
    expect([...level1!.data.slice(0, 3)]).toEqual([40, 160, 40])
    // A plain average would be (40 + 0) / 2 in sRGB terms: much darker.
  })

  it('rescales alpha so the stem stays as visible as at full size', () => {
    const [level0, level1] = gameMipLevels(STEM, 1, AUTO)
    const full = alphaTestCoverage(level0!, 0.5, 1)
    // Plain mean alpha would be 127 (< 0.5): the stem would vanish; rescaled it passes.
    expect(level1!.data[3]).toBeGreaterThan(127)
    expect(full).toBeGreaterThan(0)
  })

  it('averages opaque textures in linear light (mean strategy, no rescale)', () => {
    const black = [0, 0, 0, 255]
    const white = [255, 255, 255, 255]
    const [, level1] = gameMipLevels(
      image([
        [black, white],
        [white, black]
      ]),
      1,
      AUTO
    )
    // Linear mean 0.5 → sRGB 188, not 128.
    expect([...level1!.data]).toEqual([188, 188, 188, 255])
  })

  it('does not solidify item textures and stops at 1×1', () => {
    const levels = gameMipLevels(STEM, 8, { ...AUTO, item: true })
    expect(levels.map((l) => l.width)).toEqual([4, 2, 1])
    expect(levels[0]!.data[0]).toBe(0)
  })

  it('never changes the caller’s pixels', () => {
    const copy = new Uint8Array(STEM.data)
    gameMipLevels(STEM, 2, AUTO)
    expect(STEM.data).toEqual(copy)
  })
})

describe('mipOptionsFromMcmeta', () => {
  it('reads the texture section, with the game defaults', () => {
    expect(mipOptionsFromMcmeta(null)).toEqual(AUTO)
    expect(
      mipOptionsFromMcmeta({
        texture: { mipmap_strategy: 'strict_cutout', alpha_cutoff_bias: 0.1 }
      })
    ).toEqual({ strategy: 'strict_cutout', alphaCutoffBias: 0.1, item: false })
    expect(mipOptionsFromMcmeta({ texture: { mipmap_strategy: 'nope' } }, true)).toEqual({
      ...AUTO,
      item: true
    })
  })
})
