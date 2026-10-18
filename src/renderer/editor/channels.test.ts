import { describe, expect, it } from 'vitest'
import {
  DEFAULT_HEIGHT,
  DEFAULT_NORMALS,
  DEFAULT_OCCLUSION,
  MIN_HEIGHT
} from '../../shared/pbrGenerator'
import {
  buildProxy,
  channelDef,
  EditedMap,
  grayRamp,
  newMap,
  NEW_TEXEL,
  syncProxy
} from './channels'
import { History } from './history'
import { generateFromHeight, generateHeight, heightsOf, normalsAreFlat } from './mapGenerate'
import { setPixel, type PixelBuffer } from './pixels'

function buffer(texels: number[][], width = texels.length): PixelBuffer {
  return {
    width,
    height: texels.length / width,
    data: new Uint8ClampedArray(texels.flat())
  }
}

describe('channel proxies', () => {
  it('shows one channel in gray and writes back only that byte', () => {
    const map = buffer([
      [10, 20, 30, 40],
      [50, 60, 70, 80]
    ])
    const height = channelDef('height')
    const proxy = { width: 2, height: 1, data: buildProxy(height, map) }
    expect([...proxy.data]).toEqual([40, 40, 40, 255, 80, 80, 80, 255])
    setPixel(proxy, 1, 0, [200, 200, 200, 255])
    syncProxy(height, proxy, map)
    expect([...map.data]).toEqual([10, 20, 30, 40, 50, 60, 70, 200])
  })

  it('keeps "emission off" as 255 unless painted, and never stores a painted 255', () => {
    const emission = channelDef('emission')
    const map = buffer([
      [0, 0, 0, 255],
      [0, 0, 0, 100]
    ])
    const proxy = { width: 2, height: 1, data: buildProxy(emission, map) }
    // 255 = off shows black.
    expect(proxy.data[0]).toBe(0)
    syncProxy(emission, proxy, map)
    expect(map.data[3]).toBe(255)
    setPixel(proxy, 1, 0, [255, 255, 255, 255])
    syncProxy(emission, proxy, map)
    expect(map.data[7]).toBe(254)
  })

  it('erased pixels go back to the neutral value', () => {
    const height = channelDef('height')
    const map = buffer([[1, 2, 3, 50]])
    const proxy = { width: 1, height: 1, data: buildProxy(height, map) }
    setPixel(proxy, 0, 0, [0, 0, 0, 0])
    syncProxy(height, proxy, map)
    expect([...map.data]).toEqual([1, 2, 3, 255])
  })

  it('the normal proxy is the color normal map and writes red and green', () => {
    const normal = channelDef('normal')
    const map = buffer([[128, 128, 7, 9]])
    const proxy = { width: 1, height: 1, data: buildProxy(normal, map) }
    expect([...proxy.data]).toEqual([128, 128, 255, 255])
    setPixel(proxy, 0, 0, [200, 100, 255, 255])
    syncProxy(normal, proxy, map)
    expect([...map.data]).toEqual([200, 100, 7, 9])
  })

  it('builds gray ramps inside the channel range', () => {
    expect(grayRamp(128, 16, 255).map((c) => c[0])).toEqual([96, 112, 128, 144, 160])
    expect(grayRamp(250, 16, 254).map((c) => c[0])).toEqual([218, 234, 250, 254])
  })
})

describe('EditedMap', () => {
  it('is dirty only when the bytes change, and new maps start neutral', () => {
    const map = new EditedMap('specular', false, newMap('specular', 2, 2))
    expect([...map.buffer.data.slice(0, 4)]).toEqual([...NEW_TEXEL.specular])
    expect(map.present).toBe(false)
    const proxy = map.proxy(channelDef('smoothness'))
    setPixel(proxy.active.pixels, 0, 0, [90, 90, 90, 255])
    map.sync()
    expect(map.buffer.data[0]).toBe(90)
    expect(map.dirty).toBe(true)
    map.markSaved()
    expect(map.dirty).toBe(false)
    expect(map.present).toBe(true)
  })
})

describe('generator actions', () => {
  const grid = { width: 4, height: 4, frameHeight: 4, wrap: true }

  it('height from albedo, then normals and AO, each one undo step', () => {
    const map = new EditedMap('normal', false, newMap('normal', 4, 4))
    const albedo = buffer(
      Array.from({ length: 16 }, (_, i) => (i === 5 ? [0, 0, 0, 255] : [255, 255, 255, 255])),
      4
    )
    const history = new History()
    history.push(generateHeight(map, albedo, grid, { ...DEFAULT_HEIGHT, depth: 1 }))
    map.sync()
    expect(heightsOf(map)[5]).toBe(MIN_HEIGHT)
    expect(heightsOf(map)[0]).toBe(255)
    // Other channels untouched.
    expect(map.buffer.data[0]).toBe(128)
    expect(map.buffer.data[2]).toBe(255)

    history.push(generateFromHeight(map, grid, DEFAULT_NORMALS, DEFAULT_OCCLUSION))
    map.sync()
    expect(normalsAreFlat(map.buffer)).toBe(false)
    // The pit is shaded.
    expect(map.buffer.data[5 * 4 + 2]).toBeLessThan(255)

    history.undo()
    map.sync()
    expect(normalsAreFlat(map.buffer)).toBe(true)
    expect(map.buffer.data[5 * 4 + 2]).toBe(255)
    history.undo()
    map.sync()
    expect(heightsOf(map)[5]).toBe(255)
    expect(map.dirty).toBe(false)
  })
})
