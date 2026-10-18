import { describe, expect, it } from 'vitest'
import { lightingAt } from './dayNight'
import { environmentFor, LIGHTING_PRESETS } from './lightingPresets'

const luminance = (c: [number, number, number]): number =>
  0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

describe('environmentFor', () => {
  it('has an environment for every preset, with unit light directions', () => {
    for (const { id } of LIGHTING_PRESETS) {
      const env = environmentFor(id, 12)
      expect(Math.hypot(...env.sunDirection)).toBeCloseTo(1, 6)
      expect(Math.hypot(...env.moonDirection)).toBeCloseTo(1, 6)
    }
  })

  it('follows the hour of the day only for the "time" preset', () => {
    expect(environmentFor('time', 7)).toMatchObject(lightingAt(7))
    expect(environmentFor('noon', 0)).toEqual(environmentFor('noon', 15))
  })

  it('lights the cave only with the torch, and the nether without a sun', () => {
    const cave = environmentFor('cave', 12)
    expect(cave.torch).not.toBeNull()
    expect(luminance(cave.sunColor)).toBe(0)
    expect(luminance(cave.ambient)).toBeLessThan(0.05)
    const nether = environmentFor('nether', 12)
    expect(luminance(nether.sunColor)).toBe(0)
    expect(nether.ground[0]).toBeGreaterThan(nether.ground[2])
  })

  it('keeps the sun low and warm at sunset', () => {
    const sunset = environmentFor('sunset', 12)
    const noon = environmentFor('noon', 12)
    expect(sunset.sunDirection[1]).toBeLessThan(noon.sunDirection[1])
    expect(sunset.horizon[0]).toBeGreaterThan(sunset.horizon[2])
  })
})
