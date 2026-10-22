import { describe, expect, it } from 'vitest'
import { frameAt, frameRect, parseAnimation, type TextureAnimation } from './animation'

const parse = (animation: unknown, w = 16, h = 48) => parseAnimation({ animation }, w, h)
const ok = (animation: unknown, w = 16, h = 48): TextureAnimation => {
  const result = parse(animation, w, h)
  if (!result.ok || !result.animation) throw new Error(JSON.stringify(result))
  return result.animation
}

describe('parseAnimation', () => {
  it('returns null without an animation section', () => {
    expect(parseAnimation({ texture: { blur: true } }, 16, 16)).toEqual({
      ok: true,
      animation: null
    })
    expect(parseAnimation(null, 16, 16)).toEqual({ ok: true, animation: null })
  })

  it('defaults to square frames of the smaller side, played in order, 1 tick each', () => {
    expect(ok({})).toEqual({
      frameWidth: 16,
      frameHeight: 16,
      columns: 1,
      frameCount: 3,
      frames: [
        { index: 0, time: 1 },
        { index: 1, time: 1 },
        { index: 2, time: 1 }
      ],
      interpolate: false,
      totalTicks: 3
    })
    // Horizontal strip: frames to the right.
    expect(ok({}, 64, 16)).toMatchObject({
      frameWidth: 16,
      frameHeight: 16,
      columns: 4,
      frameCount: 4
    })
  })

  it('reads frametime, custom frames with per-frame time, and interpolate', () => {
    const animation = ok({
      frametime: 4,
      interpolate: true,
      frames: [2, { index: 0, time: 10 }, 1]
    })
    expect(animation.frames).toEqual([
      { index: 2, time: 4 },
      { index: 0, time: 10 },
      { index: 1, time: 4 }
    ])
    expect(animation.totalTicks).toBe(18)
    expect(animation.interpolate).toBe(true)
  })

  it('supports explicit frame sizes laid out row by row', () => {
    const animation = ok({ width: 16, height: 8 }, 32, 16)
    expect(animation).toMatchObject({ frameWidth: 16, frameHeight: 8, columns: 2, frameCount: 4 })
    expect(frameRect(animation, 3)).toEqual({ x: 16, y: 8, width: 16, height: 8 })
  })

  it('with only width or height, the other side is the image side (as the game)', () => {
    expect(ok({ height: 16 }, 32, 48)).toMatchObject({
      frameWidth: 32,
      frameHeight: 16,
      columns: 1,
      frameCount: 3
    })
    expect(ok({ width: 16 }, 32, 48)).toMatchObject({
      frameWidth: 16,
      frameHeight: 48,
      columns: 2,
      frameCount: 2
    })
  })

  it.each([
    [{ width: 0 }, 16, 48],
    [{ frametime: 1.5 }, 16, 48],
    [{ interpolate: 'yes' }, 16, 48],
    [{ frames: [] }, 16, 48],
    [{ frames: [3] }, 16, 48],
    [{ frames: [{ index: 0, time: 0 }] }, 16, 48],
    [{}, 16, 40],
    ['nope', 16, 48]
  ])('rejects %j on a %ix%i image', (animation, w, h) => {
    expect(parse(animation, w, h).ok).toBe(false)
  })
})

describe('frameAt', () => {
  const animation = ok({ frametime: 2, frames: [0, { index: 2, time: 4 }, 1] })

  it('walks frames by their durations and loops', () => {
    const at = (t: number) => frameAt(animation, t).current.index
    expect([0, 1, 2, 5, 6, 7, 8, 9].map(at)).toEqual([0, 0, 2, 2, 1, 1, 0, 0])
  })

  it('blends towards the next frame only with interpolation', () => {
    expect(frameAt(animation, 1).blend).toBe(0)
    const smooth = ok({ frametime: 4, interpolate: true })
    expect(frameAt(smooth, 1)).toEqual({
      current: { index: 0, time: 4 },
      next: { index: 1, time: 4 },
      blend: 0.25
    })
    // The last frame fades into the first.
    expect(frameAt(smooth, 10).next.index).toBe(0)
  })

  it('handles negative and fractional ticks', () => {
    // -1 wraps to tick 7 of 8: the last frame (index 1).
    expect(frameAt(animation, -1).current.index).toBe(1)
    expect(frameAt(animation, 2.5).current.index).toBe(2)
  })
})
