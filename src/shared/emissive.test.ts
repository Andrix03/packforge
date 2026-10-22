import { describe, expect, it } from 'vitest'
import { emissiveOverlay, emissivePath, emissiveProperties, validEmissiveSuffix } from './emissive'

// 2×1 albedo: an orange and a blue pixel.
const albedo = { width: 2, height: 1, data: [250, 120, 20, 255, 20, 40, 200, 255] }
const specular = (a0: number, a1: number) => ({
  width: 2,
  height: 1,
  data: [0, 0, 0, a0, 0, 0, 0, a1]
})

describe('emissiveOverlay', () => {
  it('keeps the albedo color where _s emits, alpha = strength; 255 means none', () => {
    expect([...emissiveOverlay(albedo, specular(254, 255))!]).toEqual([
      250, 120, 20, 255, 0, 0, 0, 0
    ])
    expect(emissiveOverlay(albedo, specular(127, 255))![3]).toBe(128)
    expect(emissiveOverlay(albedo, specular(255, 0))).toBeNull()
  })

  it('cutoff and full brightness options', () => {
    expect(emissiveOverlay(albedo, specular(50, 200), { cutoff: 0.5, full: false })![3]).toBe(0)
    expect(emissiveOverlay(albedo, specular(50, 200), { cutoff: 0, full: true })![3]).toBe(255)
  })

  it('samples a map of another resolution at the matching pixel', () => {
    const big = { width: 4, height: 2, data: new Array(32).fill(0) }
    for (let i = 3; i < 32; i += 4) big.data[i] = 255
    big.data[3] = 254 // top-left 2×2 block of the map = albedo pixel 0
    expect(emissiveOverlay(albedo, big)![3]).toBe(255)
  })
})

describe('paths and settings', () => {
  it('names the overlay, writes the properties only for a custom suffix', () => {
    expect(emissivePath('assets/minecraft/textures/block/glowstone.png')).toBe(
      'assets/minecraft/textures/block/glowstone_e.png'
    )
    expect(emissiveProperties('_e')).toBeNull()
    expect(emissiveProperties('_glow')).toBe('suffix.emissive=_glow\n')
    expect(validEmissiveSuffix('_s')).toContain('LabPBR')
    expect(validEmissiveSuffix('E')).not.toBeNull()
    expect(validEmissiveSuffix('_glow')).toBeNull()
  })
})
