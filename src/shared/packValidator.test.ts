import { describe, expect, it } from 'vitest'
import {
  checkMapShape,
  checkNormal,
  checkOrphans,
  checkSpecular,
  findMapPairs,
  sortIssues,
  type Image
} from './packValidator'

const B = 'assets/minecraft/textures/block/'

/** An image where every pixel is `texel`. */
function solid(width: number, height: number, texel: readonly number[]): Image {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(texel, i * 4)
  return { width, height, data }
}

const still = (w: number, h: number): { width: number; height: number; mcmeta: unknown } => ({
  width: w,
  height: h,
  mcmeta: null
})
const animated = (w: number, h: number, extra: object = {}) => ({
  width: w,
  height: h,
  mcmeta: { animation: { frametime: 2, ...extra } }
})

describe('findMapPairs / checkOrphans', () => {
  const pack = [
    `${B}stone.png`,
    `${B}stone_n.png`,
    `${B}dirt_s.png`,
    `${B}ghost_n.png`,
    `${B}lost.png.mcmeta`,
    `${B}stone.png.mcmeta`,
    'assets/minecraft/textures/particle/sga_n.png',
    'assets/minecraft/models/block/odd_s.png'
  ]
  const vanilla = new Set([
    `${B}dirt.png`,
    `${B}stone.png`,
    'assets/minecraft/textures/particle/sga_n.png'
  ])

  it('pairs maps with the pack texture, else the game one, and skips game textures named _n', () => {
    const pairs = findMapPairs(pack, vanilla)
    expect(pairs.map((p) => [p.path.split('/').pop(), p.albedoSource])).toEqual([
      ['stone_n.png', 'pack'],
      ['dirt_s.png', 'vanilla'],
      ['ghost_n.png', null]
    ])
  })

  it('reports maps without a texture and .mcmeta without PNG', () => {
    const issues = checkOrphans(pack, findMapPairs(pack, vanilla), true)
    expect(issues.map((i) => [i.severity, i.path.split('/').pop()])).toEqual([
      ['warning', 'ghost_n.png'],
      ['warning', 'lost.png.mcmeta']
    ])
  })

  it('only hints when the game jar is not loaded', () => {
    const issues = checkOrphans(pack, findMapPairs(pack, null), false)
    expect(issues.filter((i) => i.path.endsWith('_s.png'))[0]?.severity).toBe('info')
  })
})

describe('checkMapShape', () => {
  const path = `${B}x_n.png`

  it('accepts the same size, and an exact smaller map as info', () => {
    expect(checkMapShape(path, still(16, 16), still(16, 16))).toEqual([])
    expect(checkMapShape(path, still(8, 8), still(16, 16))[0]?.severity).toBe('info')
  })

  it('warns when the resize is not an exact enlargement (bilinear)', () => {
    expect(checkMapShape(path, still(32, 32), still(16, 16))[0]?.severity).toBe('warning')
    expect(checkMapShape(path, still(24, 24), still(16, 16))[0]?.severity).toBe('warning')
  })

  it('reports a different aspect ratio as an error', () => {
    expect(checkMapShape(path, still(16, 32), still(16, 16))[0]?.severity).toBe('error')
  })

  it('reports an animated texture whose map strip has no .mcmeta', () => {
    const issues = checkMapShape(path, still(16, 48), animated(16, 48))
    expect(issues[0]?.severity).toBe('error')
    expect(issues[0]?.message).toContain('x_n.png.mcmeta')
  })

  it('accepts a still map on an animated texture, and a matching animated map', () => {
    expect(checkMapShape(path, still(16, 16), animated(16, 48))).toEqual([])
    expect(checkMapShape(path, animated(16, 48), animated(16, 48))).toEqual([])
  })

  it('warns when the frame counts differ', () => {
    expect(checkMapShape(path, animated(16, 32), animated(16, 48))[0]?.message).toContain(
      '2 frame contro i 3'
    )
  })

  it('reports a map image that does not divide into its frames', () => {
    const bad = { width: 16, height: 40, mcmeta: { animation: { height: 16 } } }
    expect(checkMapShape(path, bad, animated(16, 48))[0]?.severity).toBe('error')
  })
})

describe('checkSpecular', () => {
  const path = `${B}x_s.png`

  it('is quiet on a normal map with emission off', () => {
    expect(checkSpecular(path, solid(4, 4, [40, 10, 0, 255]), null)).toEqual([])
  })

  it('warns when every pixel emits (alpha used as opacity)', () => {
    expect(checkSpecular(path, solid(4, 4, [40, 10, 0, 254]), null)[0]?.message).toContain(
      'Tutti i pixel emettono'
    )
  })

  it('warns about wiped pixels and undefined metal codes', () => {
    const image = solid(2, 1, [0, 0, 0, 0])
    const data = image.data as Uint8Array
    data.set([200, 240, 0, 255], 4)
    const messages = checkSpecular(path, image, null).map((i) => i.message)
    expect(messages.some((m) => m.startsWith('1 pixel è completamente'))).toBe(true)
    expect(messages.some((m) => m.includes('238 e 254'))).toBe(true)
  })

  it('notes light on transparent texture pixels without calling the block all-emissive', () => {
    const map = solid(2, 1, [0, 10, 0, 255])
    ;(map.data as Uint8Array).set([0, 10, 0, 200], 4)
    const albedo = solid(2, 1, [100, 100, 100, 255])
    ;(albedo.data as Uint8Array).set([0, 0, 0, 0], 4)
    const issues = checkSpecular(path, map, albedo)
    expect(issues.map((i) => i.severity)).toEqual(['info'])
  })
})

describe('checkNormal', () => {
  const path = `${B}x_n.png`

  it('is quiet on a flat map', () => {
    expect(checkNormal(path, solid(4, 4, [128, 128, 255, 255]))).toEqual([])
  })

  it('errors when the height is 0 everywhere, warns for some 0 pixels', () => {
    expect(checkNormal(path, solid(2, 2, [128, 128, 255, 0]))[0]?.severity).toBe('error')
    const some = solid(2, 1, [128, 128, 255, 255])
    ;(some.data as Uint8Array)[7] = 0
    expect(checkNormal(path, some)[0]?.message).toContain('1 pixel ha altezza 0')
  })

  it('warns about normals longer than 1, not about a 45° one', () => {
    expect(checkNormal(path, solid(1, 1, [255, 255, 128, 255]))[0]?.message).toContain(
      'fuori scala'
    )
    const tilt = Math.round((Math.SQRT1_2 * 0.5 + 0.5) * 255)
    expect(checkNormal(path, solid(1, 1, [tilt, 128, 218, 255]))).toEqual([])
  })
})

describe('sortIssues', () => {
  it('puts errors first', () => {
    const sorted = sortIssues([
      { severity: 'info', path: 'a', message: '' },
      { severity: 'error', path: 'b', message: '' },
      { severity: 'warning', path: 'a', message: '' }
    ])
    expect(sorted.map((i) => i.severity)).toEqual(['error', 'warning', 'info'])
  })
})
