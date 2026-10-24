import { describe, expect, it } from 'vitest'
import {
  NEUTRAL,
  packGuiTextures,
  packTextureAreas,
  packTexturesIn,
  RECOLOR_PRESETS,
  recolorPixels
} from './guiRecolor'

const pixel = (r: number, g: number, b: number, a = 255) => new Uint8ClampedArray([r, g, b, a])
const luma = (p: Uint8ClampedArray) =>
  0.2126 * (p[0] ?? 0) + 0.7152 * (p[1] ?? 0) + 0.0722 * (p[2] ?? 0)

describe('recolorPixels', () => {
  it('leaves colours alone with neutral settings (within rounding)', () => {
    const out = recolorPixels(pixel(198, 120, 40), NEUTRAL)
    expect(Math.abs((out[0] ?? 0) - 198)).toBeLessThanOrEqual(1)
    expect(Math.abs((out[1] ?? 0) - 120)).toBeLessThanOrEqual(1)
    expect(Math.abs((out[2] ?? 0) - 40)).toBeLessThanOrEqual(1)
  })

  it('never touches alpha, and keeps fully transparent pixels as they are', () => {
    const out = recolorPixels(
      new Uint8ClampedArray([10, 20, 30, 0, 200, 200, 200, 128]),
      RECOLOR_PRESETS.dark
    )
    expect([...out.slice(0, 4)]).toEqual([10, 20, 30, 0])
    expect(out[7]).toBe(128)
  })

  it('dark mode darkens the light grey of a button, grey takes the colour out', () => {
    const button = pixel(198, 198, 198)
    expect(luma(recolorPixels(button, RECOLOR_PRESETS.dark))).toBeLessThan(luma(button) * 0.6)
    const red = recolorPixels(pixel(200, 40, 40), RECOLOR_PRESETS.grey)
    expect(Math.abs((red[0] ?? 0) - (red[1] ?? 0))).toBeLessThanOrEqual(2)
  })

  it('a hue turn keeps the lightness of the pixel', () => {
    const orange = pixel(220, 120, 30)
    const turned = recolorPixels(orange, { hue: 120, saturation: 1, lightness: 0, contrast: 1 })
    expect(Math.abs(luma(turned) - luma(orange))).toBeLessThan(25)
    expect(turned[0]).not.toBe(orange[0])
  })
})

describe('packGuiTextures', () => {
  it('lists the GUI textures of a pack, without LabPBR maps or other folders', () => {
    expect(
      packGuiTextures([
        'assets/minecraft/textures/gui/sprites/widget/button.png',
        'assets/minecraft/textures/gui/sprites/widget/button.png.mcmeta',
        'assets/minecraft/textures/gui/container/inventory.png',
        'assets/minecraft/textures/gui/container/inventory_n.png',
        'assets/minecraft/textures/block/stone.png'
      ])
    ).toEqual([
      'assets/minecraft/textures/gui/container/inventory.png',
      'assets/minecraft/textures/gui/sprites/widget/button.png'
    ])
  })
})

describe('texture areas', () => {
  const files = [
    'assets/minecraft/textures/block/stone.png',
    'assets/minecraft/textures/block/stone_n.png',
    'assets/minecraft/textures/block/lamp_e.png',
    'assets/minecraft/textures/block/dirt.png',
    'assets/minecraft/textures/item/apple.png',
    'assets/minecraft/textures/gui/sprites/widget/button.png',
    'pack.png'
  ]
  it('counts the textures by folder, maps and overlays left out', () => {
    expect(packTextureAreas(files)).toEqual([
      { area: 'block', count: 2 },
      { area: 'gui', count: 1 },
      { area: 'item', count: 1 }
    ])
    expect(packTexturesIn(files, 'block')).toEqual([
      'assets/minecraft/textures/block/dirt.png',
      'assets/minecraft/textures/block/stone.png'
    ])
    expect(packTexturesIn(files, null)).toHaveLength(4)
  })
})
