import { describe, expect, it } from 'vitest'
import {
  createTexturePixels,
  sizeOptions,
  STARTING_NOISE_RAMP,
  validateTextureFolder,
  validateTextureName
} from './newTexture'
import { analyzeTexture } from './advice'
import { generateRamp } from './ramp'

describe('validateTextureName', () => {
  it.each(['stone', 'oak_planks', 'my-block.v2', 'a1'])('accepts %j', (name) => {
    expect(validateTextureName(name)).toBeNull()
  })

  it.each(['', 'Stone', 'my block', 'pietra/scura', '.hidden', 'end.', 'età'])(
    'rejects %j',
    (name) => {
      expect(validateTextureName(name)).not.toBeNull()
    }
  )
})

describe('validateTextureFolder', () => {
  it.each(['assets/minecraft/textures/block', 'assets/mymod/textures/item/tools'])(
    'accepts %j',
    (folder) => expect(validateTextureFolder(folder)).toBeNull()
  )

  it.each([
    'assets/minecraft/models/block',
    'textures/block',
    'assets/minecraft',
    'assets/Minecraft/textures/block',
    'assets/minecraft/textures/..'
  ])('rejects %j', (folder) => expect(validateTextureFolder(folder)).not.toBeNull())
})

describe('sizeOptions', () => {
  it('offers squares, or the vanilla shape and its 2x and 4x', () => {
    expect(sizeOptions(null).map((s) => s.width)).toEqual([16, 32, 64, 128])
    expect(sizeOptions({ width: 16, height: 16 }).map((s) => s.width)).toEqual([16, 32, 64, 128])
    expect(sizeOptions({ width: 200, height: 20 })).toEqual([
      { width: 200, height: 20 },
      { width: 400, height: 40 },
      { width: 800, height: 80 }
    ])
  })

  it('offers smaller sizes for a vanilla texture already drawn large', () => {
    expect(sizeOptions({ width: 1024, height: 256 }).map((s) => `${s.width}x${s.height}`)).toEqual([
      '256x64',
      '512x128',
      '1024x256',
      '2048x512'
    ])
  })

  it('fills a non-square texture', () => {
    expect(createTexturePixels({ width: 3, height: 2 }, 'color', [1, 2, 3, 255]).length).toBe(24)
  })
})

describe('createTexturePixels', () => {
  const GREEN = [94, 157, 52, 255] as const

  it('starts empty (transparent) or filled with an opaque color', () => {
    expect([...createTexturePixels(2, 'empty', GREEN)]).toEqual(new Array(16).fill(0))
    expect([...createTexturePixels(2, 'color', [94, 157, 52, 10])]).toEqual([
      ...GREEN,
      ...GREEN,
      ...GREEN,
      ...GREEN
    ])
  })

  it('fills noise with colors from the ramp of the base color', () => {
    const ramp = generateRamp(GREEN, STARTING_NOISE_RAMP).map((c) => c.join())
    const data = createTexturePixels(16, 'noise', GREEN, () => 0.3)
    for (let i = 0; i < data.length; i += 4) {
      expect(ramp).toContain([...data.subarray(i, i + 4)].join())
    }
  })
})

describe('starting noise', () => {
  it.each([
    ['dirt', [134, 96, 67, 255]],
    ['stone', [127, 127, 127, 255]],
    ['grass', [94, 157, 52, 255]],
    ['sand', [219, 207, 163, 255]]
  ] as const)('does not trigger advice on %s', (_, color) => {
    const data = createTexturePixels(16, 'noise', color)
    const advice = analyzeTexture({ width: 16, height: 16, data: new Uint8ClampedArray(data) })
    expect(advice).toEqual([])
  })
})
