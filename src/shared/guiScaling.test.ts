import { describe, expect, it } from 'vitest'
import { layoutSprite, parseGuiScaling, type GuiScaling } from './guiScaling'

const nine = (extra: Record<string, unknown> = {}) => ({
  gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 4, ...extra } }
})

describe('parseGuiScaling', () => {
  it('reads the three types (no section = stretch)', () => {
    expect(parseGuiScaling(null)).toEqual({ ok: true, scaling: { type: 'stretch' } })
    expect(parseGuiScaling({ gui: { scaling: { type: 'tile', width: 16, height: 8 } } })).toEqual({
      ok: true,
      scaling: { type: 'tile', width: 16, height: 8 }
    })
    expect(
      parseGuiScaling(nine({ border: { left: 2, top: 3, right: 4, bottom: 5 } }))
    ).toMatchObject({
      ok: true,
      scaling: { border: { left: 2, top: 3, right: 4, bottom: 5 }, stretchInner: false }
    })
  })

  it('refuses what the game refuses: no centre slice, bad sizes', () => {
    expect(parseGuiScaling(nine({ border: 10, height: 20 }))).toMatchObject({ ok: false })
    expect(parseGuiScaling(nine({ width: 0 }))).toMatchObject({ ok: false })
    expect(parseGuiScaling(nine({ border: -1 }))).toMatchObject({ ok: false })
    expect(parseGuiScaling({ gui: { scaling: { type: 'mirror' } } })).toMatchObject({ ok: false })
  })
})

describe('layoutSprite', () => {
  const scaling = (parseGuiScaling(nine()) as { scaling: GuiScaling }).scaling

  it('draws the sprite whole at its own size', () => {
    expect(layoutSprite(scaling, 200, 20)).toHaveLength(1)
  })

  it('a wider button: 3 slices, the middle repeated', () => {
    const pieces = layoutSprite(scaling, 300, 20)
    expect(pieces.map((p) => [p.target.x, p.target.width, p.fill])).toEqual([
      [0, 4, 'stretch'],
      [4, 292, 'tile'],
      [296, 4, 'stretch']
    ])
    expect(pieces[1]!.source).toEqual({ x: 4, y: 0, width: 192, height: 20 })
  })

  it('both sizes different: 9 slices; stretch_inner stretches instead of repeating', () => {
    expect(layoutSprite(scaling, 300, 40)).toHaveLength(9)
    const stretched = (parseGuiScaling(nine({ stretch_inner: true })) as { scaling: GuiScaling })
      .scaling
    expect(layoutSprite(stretched, 300, 40).every((p) => p.fill === 'stretch')).toBe(true)
  })

  it('borders shrink to half the drawn size, like the game', () => {
    const pieces = layoutSprite(scaling, 6, 6)
    expect(pieces[0]!.target).toEqual({ x: 0, y: 0, width: 3, height: 3 })
    expect(pieces.filter((p) => p.target.width > 0 && p.target.height > 0)).toHaveLength(4)
  })
})
