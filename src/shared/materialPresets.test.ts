import { describe, expect, it } from 'vitest'
import { MAX_F0_VALUE, MAX_POROSITY_VALUE, METALS } from './labpbr'
import {
  accentMask,
  applyMaterial,
  cropParts,
  DEFAULT_MATERIAL,
  f0Byte,
  GEMS,
  glowOf,
  materialPreset,
  MATERIALS,
  type MaterialOptions
} from './materialPresets'

/** RGBA pixels from [r, g, b] (alpha 255) or [r, g, b, a]. */
function rgba(pixels: ReadonlyArray<readonly number[]>): Uint8Array {
  const out = new Uint8Array(pixels.length * 4)
  pixels.forEach((p, i) => out.set([p[0]!, p[1]!, p[2]!, p[3] ?? 255], i * 4))
  return out
}

/** An untouched `_s`: rough, 4% dielectric, no emission. */
function blankSpecular(pixels: number): Uint8Array {
  const out = new Uint8Array(pixels * 4)
  for (let i = 0; i < pixels; i++) out.set([0, 10, 0, 255], i * 4)
  return out
}

function options(change: Partial<MaterialOptions>): MaterialOptions {
  return { ...DEFAULT_MATERIAL, variation: 0, ...change }
}

describe('preset values', () => {
  it('computes dielectric F0 from the refractive index (water 2%, glass 4%, diamond 17%)', () => {
    expect(f0Byte(1.33)).toBe(5)
    expect(f0Byte(1.5)).toBe(10)
    expect(f0Byte(2.42)).toBe(44)
  })

  it('keeps every preset and gem inside the spec ranges', () => {
    const all = [...MATERIALS.map((m) => m.values), ...GEMS.map((g) => g.values)]
    for (const v of all) {
      expect(v.smoothness).toBeGreaterThanOrEqual(0)
      expect(v.smoothness).toBeLessThanOrEqual(255)
      const metal = METALS.some((m) => m.value === v.f0) || v.f0 === 255
      expect(metal || v.f0 <= MAX_F0_VALUE).toBe(true)
      expect(v.porosity).toBeLessThanOrEqual(255)
    }
  })

  it('uses the spec porosity for wood, wool and sand, and SSS for leaves', () => {
    expect(materialPreset('wood').values.porosity).toBe(12)
    expect(materialPreset('wool').values.porosity).toBe(38)
    expect(materialPreset('soil').values.porosity).toBe(MAX_POROSITY_VALUE)
    expect(materialPreset('leaves').values.porosity).toBeGreaterThan(MAX_POROSITY_VALUE)
  })
})

describe('applyMaterial', () => {
  it('writes R, G, B and leaves emission alone', () => {
    const current = rgba([[0, 10, 0, 200]])
    const out = applyMaterial(rgba([[120, 120, 120]]), current, options({ preset: 'wood' }))
    expect([...out]).toEqual([70, 10, 12, 200])
  })

  it('writes the chosen metal for the metal preset', () => {
    const out = applyMaterial(
      rgba([[200, 160, 40]]),
      blankSpecular(1),
      options({ preset: 'metal', metal: 231 })
    )
    expect(out[1]).toBe(231)
    expect(out[2]).toBe(0)
  })

  it('skips transparent pixels and pixels outside the mask', () => {
    const albedo = rgba([
      [100, 100, 100],
      [100, 100, 100, 0],
      [100, 100, 100]
    ])
    const out = applyMaterial(
      albedo,
      blankSpecular(3),
      options({ preset: 'glass' }),
      Uint8Array.of(1, 1, 0)
    )
    expect([...out.slice(0, 4)]).toEqual([245, 10, 0, 255])
    expect([...out.slice(4, 8)]).toEqual([0, 10, 0, 255])
    expect([...out.slice(8, 12)]).toEqual([0, 10, 0, 255])
  })

  it('makes darker pixels rougher with variation, around the preset value', () => {
    const albedo = rgba([
      [60, 60, 60],
      [180, 180, 180]
    ])
    const out = applyMaterial(albedo, blankSpecular(2), options({ preset: 'stone', variation: 1 }))
    expect(out[0]).toBeLessThan(50)
    expect(out[4]).toBeGreaterThan(50)
    expect((out[0]! + out[4]!) / 2).toBeCloseTo(50, 0)
  })

  it('turns the colored pixels of an ore into the gem and the rest into stone', () => {
    const stone: number[] = [128, 128, 128]
    const albedo = rgba([stone, stone, stone, [90, 230, 220], stone])
    const out = applyMaterial(albedo, blankSpecular(5), options({ preset: 'ore', gem: 'diamond' }))
    expect([...out.slice(12, 15)]).toEqual([225, 44, 0])
    expect([...out.slice(0, 3)]).toEqual([50, 10, 24])
  })

  it('lights only pixels above the glow threshold, and writes 255 (off) below it', () => {
    const albedo = rgba([
      [40, 40, 40],
      [255, 230, 150]
    ])
    const out = applyMaterial(albedo, blankSpecular(2), options({ preset: 'emissive' }))
    expect(out[3]).toBe(255)
    expect(out[7]).toBeGreaterThanOrEqual(127)
    expect(out[7]).toBeLessThanOrEqual(254)
  })
  it('gives a crop leaves with SSS, dry parts less SSS, fruit no SSS and smoother', () => {
    const albedo = rgba([
      [79, 154, 47],
      [214, 180, 70],
      [232, 128, 42],
      [0, 0, 0, 0]
    ])
    const out = applyMaterial(albedo, blankSpecular(4), options({ preset: 'crop' }))
    expect([...out.slice(0, 3)]).toEqual([90, 10, 170])
    expect([...out.slice(4, 7)]).toEqual([55, 10, 110])
    expect([...out.slice(8, 11)]).toEqual([140, 10, 0])
    // Transparent pixels are left alone.
    expect([...out.slice(12, 16)]).toEqual([0, 10, 0, 255])
  })
})

describe('cropParts', () => {
  it('tells leaf, dry and fruit apart by hue', () => {
    const albedo = rgba([
      [79, 154, 47],
      [214, 180, 70],
      [232, 128, 42],
      [140, 30, 40],
      [200, 200, 195],
      [0, 0, 0, 0]
    ])
    expect([...cropParts(albedo, 6)]).toEqual([1, 2, 3, 3, 2, 0])
  })

  it('reads an all-gray texture (tinted by the game, like stems) as leaves', () => {
    const albedo = rgba([
      [120, 120, 120],
      [180, 180, 180],
      [0, 0, 0, 0]
    ])
    expect([...cropParts(albedo, 3)]).toEqual([1, 1, 0])
  })
})

describe('accentMask', () => {
  it('finds hue and lightness outliers, not the shades of the base', () => {
    const albedo = rgba([
      [120, 120, 120],
      [135, 135, 135],
      [128, 128, 128],
      [20, 20, 20], // coal
      [200, 60, 50], // redstone
      [125, 125, 125]
    ])
    expect([...accentMask(albedo, 6, 0.2)]).toEqual([0, 0, 0, 1, 1, 0])
  })

  it('treats a colored base as the base (netherrack is not all gem)', () => {
    const albedo = rgba([
      [110, 40, 40],
      [100, 35, 35],
      [120, 45, 45],
      [240, 235, 225]
    ])
    expect([...accentMask(albedo, 4, 0.2)]).toEqual([0, 0, 0, 1])
  })
})

describe('glowOf', () => {
  it('is off below the threshold and 127–254 above it', () => {
    expect(glowOf(0.4, 0.55)).toBe(0)
    expect(glowOf(0.55, 0.55)).toBe(127)
    expect(glowOf(1, 0.55)).toBe(254)
  })
})
