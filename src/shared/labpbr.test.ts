import { describe, expect, it } from 'vitest'
import {
  conductorF0,
  decodeNormal,
  decodeSpecular,
  encodeNormal,
  encodeSpecular,
  FLAT_NORMAL,
  mapKindOf,
  mapPath,
  metalF0,
  METALS,
  NO_SPECULAR,
  roughnessOf,
  smoothnessOf,
  type Rgba
} from './labpbr'

describe('normal map', () => {
  it('decodes X/Y DirectX-style and rebuilds Z', () => {
    const flat = decodeNormal(FLAT_NORMAL)
    expect(flat.normal[0]).toBeCloseTo(0, 2)
    expect(flat.normal[1]).toBeCloseTo(0, 2)
    expect(flat.normal[2]).toBeCloseTo(1, 3)
    expect(flat.ao).toBe(1)
    expect(flat.height).toBe(1)
    // Green 0 = pointing up (negative Y), red 255 = right.
    expect(decodeNormal([128, 0, 255, 255]).normal[1]).toBe(-1)
    expect(decodeNormal([255, 128, 255, 255]).normal[0]).toBe(1)
    expect(decodeNormal([255, 128, 255, 255]).normal[2]).toBeCloseTo(0, 1)
  })

  it('never returns NaN for X/Y outside the unit circle', () => {
    expect(decodeNormal([255, 255, 0, 0]).normal[2]).toBe(0)
    expect(decodeNormal([255, 255, 0, 0]).ao).toBe(0)
  })

  it('round-trips through encode', () => {
    for (const texel of [
      [128, 128, 255, 255],
      [200, 60, 90, 1],
      [10, 240, 0, 128]
    ] as Rgba[]) {
      const decoded = decodeNormal(texel)
      if (Math.hypot(decoded.normal[0], decoded.normal[1]) > 1) continue
      expect(encodeNormal(decoded)).toEqual(texel)
    }
    expect(encodeNormal({ normal: [0, 0, 2], ao: 1, height: 1 })).toEqual([128, 128, 255, 255])
  })
})

describe('specular map', () => {
  it('reads an empty map as a rough dielectric with no F0 and no emission', () => {
    expect(decodeSpecular(NO_SPECULAR)).toEqual({
      smoothness: 0,
      reflectance: { kind: 'dielectric', f0: 0 },
      porosity: 0,
      sss: 0,
      emission: 0
    })
  })

  it('converts perceptual smoothness to roughness and back', () => {
    expect(roughnessOf(0)).toBe(1)
    expect(roughnessOf(1)).toBe(0)
    expect(roughnessOf(0.5)).toBe(0.25)
    expect(smoothnessOf(roughnessOf(0.3))).toBeCloseTo(0.3, 10)
  })

  it('splits green into F0, predefined metals and albedo metals', () => {
    expect(decodeSpecular([0, 229, 0, 0]).reflectance).toEqual({
      kind: 'dielectric',
      f0: 229 / 255
    })
    expect(decodeSpecular([0, 230, 0, 0]).reflectance).toEqual({ kind: 'metal', metal: METALS[0] })
    expect(decodeSpecular([0, 237, 0, 0]).reflectance).toMatchObject({ metal: { id: 'silver' } })
    expect(decodeSpecular([0, 238, 0, 0]).reflectance).toEqual({ kind: 'albedoMetal' })
    expect(decodeSpecular([0, 255, 0, 0]).reflectance).toEqual({ kind: 'albedoMetal' })
  })

  it('splits blue into porosity (0–64) and subsurface scattering (65–255)', () => {
    expect(decodeSpecular([0, 0, 64, 0])).toMatchObject({ porosity: 1, sss: 0 })
    expect(decodeSpecular([0, 0, 32, 0])).toMatchObject({ porosity: 0.5, sss: 0 })
    expect(decodeSpecular([0, 0, 65, 0])).toMatchObject({ porosity: 0, sss: 0 })
    expect(decodeSpecular([0, 0, 255, 0])).toMatchObject({ porosity: 0, sss: 1 })
  })

  it('reads emission 0–254 and ignores alpha 255', () => {
    expect(decodeSpecular([0, 0, 0, 254]).emission).toBe(1)
    expect(decodeSpecular([0, 0, 0, 127]).emission).toBe(0.5)
    expect(decodeSpecular([0, 0, 0, 255]).emission).toBe(0)
  })

  it('round-trips through encode', () => {
    const texels: Rgba[] = [
      [255, 10, 38, 255],
      [180, 230, 0, 100],
      [40, 255, 0, 254],
      [0, 229, 200, 1],
      [128, 0, 0, 255]
    ]
    for (const texel of texels) expect(encodeSpecular(decodeSpecular(texel))).toEqual(texel)
  })

  it('encodes no emission as 255 and clamps F0 below the metal range', () => {
    const texel = decodeSpecular([0, 0, 0, 255])
    expect(encodeSpecular({ ...texel, emission: 0 })[3]).toBe(255)
    expect(encodeSpecular({ ...texel, reflectance: { kind: 'dielectric', f0: 1 } })[1]).toBe(229)
  })
})

describe('metals', () => {
  it('has the eight spec metals on 230–237', () => {
    expect(METALS.map((m) => m.value)).toEqual([230, 231, 232, 233, 234, 235, 236, 237])
  })

  it('computes F0 from the complex index of refraction', () => {
    // A perfect dielectric with n = 1.5 reflects 4%.
    expect(conductorF0(1.5, 0)).toBeCloseTo(0.04, 10)
    const gold = metalF0(METALS[1]!)
    // Gold reflects red more than blue; aluminium is bright and neutral.
    expect(gold[0]).toBeGreaterThan(gold[2])
    expect(gold[0]).toBeGreaterThan(0.9)
    for (const channel of metalF0(METALS[2]!)) expect(channel).toBeGreaterThan(0.85)
  })
})

describe('map paths', () => {
  it('names the maps after the albedo', () => {
    const stone = 'assets/minecraft/textures/block/stone.png'
    expect(mapPath(stone, 'normal')).toBe('assets/minecraft/textures/block/stone_n.png')
    expect(mapPath(stone, 'specular')).toBe('assets/minecraft/textures/block/stone_s.png')
    expect(mapKindOf('assets/minecraft/textures/block/stone_n.png')).toBe('normal')
    expect(mapKindOf('assets/minecraft/textures/block/stone_s.png')).toBe('specular')
    expect(mapKindOf(stone)).toBeNull()
  })
})
