import { describe, expect, it } from 'vitest'
import {
  borderAt,
  guiArea,
  guiTextureKind,
  layoutSprite,
  logicalSize,
  moveBorder,
  parseGuiScaling,
  withGuiScaling,
  type GuiScaling
} from './guiScaling'

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

describe('withGuiScaling', () => {
  const nineSlice: GuiScaling = {
    type: 'nine_slice',
    width: 200,
    height: 20,
    border: { left: 3, top: 3, right: 3, bottom: 3 },
    stretchInner: false
  }

  it('writes the section like the vanilla files and keeps the other sections', () => {
    const text = withGuiScaling({ animation: { frametime: 2 } }, nineSlice)
    expect(JSON.parse(text ?? '')).toEqual({
      animation: { frametime: 2 },
      gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 3 } }
    })
    const uneven = withGuiScaling(null, {
      ...nineSlice,
      border: { left: 1, top: 2, right: 3, bottom: 4 },
      stretchInner: true
    })
    expect(JSON.parse(uneven ?? '').gui.scaling).toEqual({
      type: 'nine_slice',
      width: 200,
      height: 20,
      border: { left: 1, top: 2, right: 3, bottom: 4 },
      stretch_inner: true
    })
    // Written then read back: the same scaling.
    expect(parseGuiScaling(JSON.parse(uneven ?? ''))).toMatchObject({
      ok: true,
      scaling: { stretchInner: true, border: { left: 1, top: 2, right: 3, bottom: 4 } }
    })
  })

  it('removes only the scaling, and the file when nothing is left', () => {
    expect(withGuiScaling({ gui: { scaling: { type: 'stretch' } } }, null)).toBeNull()
    expect(JSON.parse(withGuiScaling({ animation: {}, gui: { scaling: {} } }, null) ?? '')).toEqual(
      {
        animation: {}
      }
    )
  })
})

describe('GUI paths and sizes', () => {
  it('tells sprites, title textures and other GUI textures apart, with their area', () => {
    const p = 'assets/minecraft/textures/gui/'
    expect(guiTextureKind(`${p}sprites/widget/button.png`)).toBe('sprite')
    expect(guiTextureKind(`${p}title/background/panorama_0.png`)).toBe('title')
    expect(guiTextureKind(`${p}container/furnace.png`)).toBe('gui')
    expect(guiTextureKind('assets/minecraft/textures/block/stone.png')).toBeNull()
    expect(guiArea(`${p}sprites/container/furnace/lit_progress.png`)).toBe('container')
    expect(guiArea(`${p}title/minecraft.png`)).toBe('title')
    expect(guiArea(`${p}book.png`)).toBe('gui')
  })

  it('measures a sprite in GUI units: its scaling, else the vanilla size, else its pixels', () => {
    const stretch: GuiScaling = { type: 'stretch' }
    expect(
      logicalSize({ type: 'tile', width: 8, height: 4 }, { width: 32, height: 16 }, null)
    ).toEqual({ width: 8, height: 4 })
    expect(logicalSize(stretch, { width: 64, height: 64 }, { width: 32, height: 32 })).toEqual({
      width: 32,
      height: 32
    })
    expect(logicalSize(stretch, { width: 16, height: 16 }, null)).toEqual({ width: 16, height: 16 })
  })
})

describe('dragging nine-slice borders', () => {
  const border = { left: 3, top: 3, right: 3, bottom: 3 }

  it('finds the line under the pointer', () => {
    expect(borderAt(border, 200, 20, 3.4, 10)).toBe('left')
    expect(borderAt(border, 200, 20, 196.8, 10)).toBe('right')
    expect(borderAt(border, 200, 20, 100, 17.2)).toBe('bottom')
    expect(borderAt(border, 200, 20, 100, 10)).toBeNull()
  })

  it('moves one side in whole units, keeping a centre', () => {
    expect(moveBorder(border, 'left', 200, 20, 10.4, 0)).toEqual({ ...border, left: 10 })
    expect(moveBorder(border, 'right', 200, 20, 190, 0)).toEqual({ ...border, right: 10 })
    expect(moveBorder(border, 'top', 200, 20, 0, 40)).toEqual({ ...border, top: 16 })
    expect(moveBorder(border, 'bottom', 200, 20, 0, -5)).toEqual({ ...border, bottom: 16 })
    expect(moveBorder(border, 'left', 200, 20, -4, 0)).toEqual({ ...border, left: 0 })
  })
})
