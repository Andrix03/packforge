import { describe, expect, it } from 'vitest'
import {
  animationFromMcmeta,
  applyFrameOp,
  buildMcmeta,
  frameAfter,
  frameBounds,
  mapMcmeta,
  spliceRows
} from './frames'

describe('animationFromMcmeta', () => {
  it('reads a standard vertical strip', () => {
    expect(animationFromMcmeta({ animation: { frametime: 4, interpolate: true } }, 16, 64)).toEqual(
      {
        kind: 'editable',
        settings: { frameHeight: 16, frametime: 4, interpolate: true },
        frameCount: 4
      }
    )
  })

  it('no file or no animation section → not animated', () => {
    expect(animationFromMcmeta(null, 16, 16).kind).toBe('none')
    expect(animationFromMcmeta({ texture: { blur: true } }, 16, 16).kind).toBe('none')
  })

  it('flags layouts the frame editor does not handle', () => {
    const wide = animationFromMcmeta({ animation: { width: 16, height: 16 } }, 32, 16)
    expect(wide.kind).toBe('unsupported')
    expect(animationFromMcmeta({ animation: { frametime: 0 } }, 16, 32).kind).toBe('unsupported')
  })
})

describe('frameBounds / spliceRows', () => {
  it('gives the rectangle of a frame', () => {
    expect(frameBounds(16, 16, 2)).toEqual({ x0: 0, y0: 32, x1: 15, y1: 47 })
  })

  it('inserts, removes and replaces whole rows', () => {
    // 1 pixel wide, 3 rows with alpha 1, 2, 3.
    const data = Uint8ClampedArray.from([0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3])
    const alphas = (d: Uint8ClampedArray): number[] => [...d].filter((_, i) => i % 4 === 3)
    expect(alphas(spliceRows(data, 1, 1, 1, null))).toEqual([1, 3])
    expect(alphas(spliceRows(data, 1, 3, 0, Uint8ClampedArray.from([0, 0, 0, 9])))).toEqual([
      1, 2, 3, 9
    ])
    expect(alphas(spliceRows(data, 1, 0, 1, Uint8ClampedArray.from([0, 0, 0, 7])))).toEqual([
      7, 2, 3
    ])
    expect(alphas(data)).toEqual([1, 2, 3])
  })
})

describe('buildMcmeta', () => {
  it('writes only what differs from the defaults', () => {
    const json = buildMcmeta(null, { frameHeight: 16, frametime: 1, interpolate: false }, 16, 4, 4)
    expect(JSON.parse(json!)).toEqual({ animation: {} })
    const slow = buildMcmeta(null, { frameHeight: 16, frametime: 5, interpolate: true }, 16, 4, 4)
    expect(JSON.parse(slow!)).toEqual({ animation: { frametime: 5, interpolate: true } })
  })

  it('keeps other sections and unknown animation keys', () => {
    const original = { texture: { blur: true }, animation: { frametime: 2, future: 1 } }
    const json = buildMcmeta(
      original,
      { frameHeight: 16, frametime: 3, interpolate: false },
      16,
      2,
      2
    )
    expect(JSON.parse(json!)).toEqual({
      texture: { blur: true },
      animation: { frametime: 3, future: 1 }
    })
  })

  it('keeps a custom frame order only while the frame count is unchanged', () => {
    const original = { animation: { frames: [1, 0] } }
    const settings = { frameHeight: 16, frametime: 1, interpolate: false }
    expect(JSON.parse(buildMcmeta(original, settings, 16, 2, 2)!).animation.frames).toEqual([1, 0])
    expect(JSON.parse(buildMcmeta(original, settings, 16, 3, 2)!).animation.frames).toBeUndefined()
  })

  it('writes width/height for non-square frames', () => {
    const json = buildMcmeta(null, { frameHeight: 8, frametime: 1, interpolate: false }, 16, 2, 2)
    expect(JSON.parse(json!).animation).toEqual({ width: 16, height: 8 })
  })

  it('removing the animation deletes the file unless other sections remain', () => {
    expect(buildMcmeta({ animation: {} }, null, 16, 1, 1)).toBeNull()
    expect(
      JSON.parse(buildMcmeta({ animation: {}, texture: { clamp: true } }, null, 16, 1, 1)!)
    ).toEqual({
      texture: { clamp: true }
    })
  })
})

describe('mapMcmeta', () => {
  it('copies only the animation section', () => {
    const texture = JSON.stringify({
      animation: { frametime: 4, frames: [0, 1] },
      texture: { blur: true }
    })
    expect(JSON.parse(mapMcmeta(texture, 1)!)).toEqual({
      animation: { frametime: 4, frames: [0, 1] }
    })
  })

  it('scales explicit frame sizes to the map resolution', () => {
    const texture = JSON.stringify({ animation: { width: 16, height: 8 } })
    expect(JSON.parse(mapMcmeta(texture, 2)!)).toEqual({ animation: { width: 32, height: 16 } })
  })

  it('is null without an animation', () => {
    expect(mapMcmeta(null, 1)).toBeNull()
    expect(mapMcmeta(JSON.stringify({ texture: { blur: true } }), 1)).toBeNull()
  })
})

describe('applyFrameOp', () => {
  // A 1-pixel-wide strip of 1-row frames: frame i has red = values[i].
  const strip = (values: number[]): Uint8ClampedArray =>
    Uint8ClampedArray.from(values.flatMap((v) => [v, 0, 0, 255]))
  const reds = (data: Uint8ClampedArray | null): number[] =>
    data ? Array.from({ length: data.length / 4 }, (_, i) => data[i * 4]!) : []

  it('inserts a copy or an empty frame filled with the given texel', () => {
    expect(reds(applyFrameOp(strip([1, 2]), 1, 1, { kind: 'insert', at: 1, copyFrom: 0 }))).toEqual(
      [1, 1, 2]
    )
    const empty = applyFrameOp(
      strip([1, 2]),
      1,
      1,
      { kind: 'insert', at: 2, copyFrom: null },
      [128, 128, 255, 255]
    )
    expect([...empty!.subarray(8, 12)]).toEqual([128, 128, 255, 255])
  })

  it('removes and moves frames; a move past either end does not apply', () => {
    expect(reds(applyFrameOp(strip([1, 2, 3]), 1, 1, { kind: 'remove', index: 1 }))).toEqual([1, 3])
    expect(
      reds(applyFrameOp(strip([1, 2, 3]), 1, 1, { kind: 'move', index: 0, direction: 1 }))
    ).toEqual([2, 1, 3])
    expect(applyFrameOp(strip([1, 2]), 1, 1, { kind: 'move', index: 1, direction: 1 })).toBeNull()
  })

  it('names the frame shown afterwards', () => {
    expect(frameAfter({ kind: 'insert', at: 2, copyFrom: null })).toBe(2)
    expect(frameAfter({ kind: 'remove', index: 0 })).toBe(0)
    expect(frameAfter({ kind: 'move', index: 1, direction: -1 })).toBe(0)
  })
})
