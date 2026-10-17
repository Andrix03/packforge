import { describe, expect, it } from 'vitest'
import { lightingAt, normalizeHour, type Vec3 } from './dayNight'

const brightness = (c: Vec3) => c[0] + c[1] + c[2]
const length = (v: Vec3) => Math.hypot(...v)

describe('lightingAt', () => {
  it('puts the sun overhead at noon and below the horizon at midnight', () => {
    expect(lightingAt(12).sunDirection[1]).toBeGreaterThan(0.9)
    expect(lightingAt(0).sunDirection[1]).toBeLessThan(-0.9)
    // Rises in the east (+X), sets in the west.
    expect(lightingAt(7).sunDirection[0]).toBeGreaterThan(0.5)
    expect(lightingAt(17).sunDirection[0]).toBeLessThan(-0.5)
  })

  it('is brighter at noon than at midnight', () => {
    const noon = lightingAt(12)
    const night = lightingAt(0)
    expect(brightness(noon.sunColor)).toBeGreaterThan(2.5)
    expect(brightness(night.sunColor)).toBe(0)
    expect(brightness(night.moonColor)).toBeGreaterThan(0)
    expect(brightness(noon.ambient)).toBeGreaterThan(brightness(night.ambient) * 4)
    expect(brightness(noon.sky)).toBeGreaterThan(brightness(night.sky))
  })

  it('tints the sun warm near sunrise', () => {
    const dawn = lightingAt(6.6).sunColor
    expect(dawn[0]).toBeGreaterThan(dawn[2] * 1.5)
  })

  it('returns unit directions and colors in [0, 1] for every minute', () => {
    for (let minute = 0; minute < 24 * 60; minute += 7) {
      const light = lightingAt(minute / 60)
      expect(length(light.sunDirection)).toBeCloseTo(1, 6)
      expect(length(light.moonDirection)).toBeCloseTo(1, 6)
      for (const color of [light.sunColor, light.moonColor, light.ambient, light.sky]) {
        for (const channel of color) {
          expect(channel).toBeGreaterThanOrEqual(0)
          expect(channel).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('is continuous across midnight', () => {
    const before = lightingAt(23.999)
    const after = lightingAt(0)
    expect(brightness(before.sky)).toBeCloseTo(brightness(after.sky), 3)
    expect(before.sunDirection[1]).toBeCloseTo(after.sunDirection[1], 3)
  })
})

describe('normalizeHour', () => {
  it('wraps into [0, 24)', () => {
    expect(normalizeHour(25)).toBe(1)
    expect(normalizeHour(-1)).toBe(23)
    expect(normalizeHour(24)).toBe(0)
  })
})
