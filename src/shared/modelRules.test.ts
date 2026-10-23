import { describe, expect, it } from 'vitest'
import { checkModel, firstRelease, MODEL_FEATURES, modelCost, type FormatRange } from './modelRules'

const ONLY_26_3: FormatRange = { min: { major: 97, minor: 1 }, max: { major: 97, minor: 1 } }
const FROM_1_21: FormatRange = { min: { major: 34, minor: 0 }, max: { major: 97, minor: 1 } }
const OLD_ONLY: FormatRange = { min: { major: 34, minor: 0 }, max: { major: 46, minor: 0 } }

const face = { texture: '#all' }
const cube = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  from: [0, 0, 0],
  to: [16, 16, 16],
  faces: { north: face, south: face },
  ...extra
})
const model = (...elements: unknown[]): unknown => ({ textures: { all: 'block/stone' }, elements })
const messages = (json: unknown, range: FormatRange, severity = 'error'): string[] =>
  checkModel(json, range)
    .filter((i) => i.severity === severity)
    .map((i) => i.message)

describe('checkModel', () => {
  it('accepts a plain cube for every version', () => {
    expect(checkModel(model(cube()), FROM_1_21)).toEqual([])
  })

  it('rejects what the game itself rejects (bounds, no faces, bad face rotation)', () => {
    expect(messages(model(cube({ to: [16, 33, 16] })), ONLY_26_3)[0]).toContain('da -16 a 32')
    expect(messages(model(cube({ faces: {} })), ONLY_26_3)[0]).toContain('da 1 a 6 facce')
    const turned = cube({ faces: { up: { texture: '#all', rotation: 45 } } })
    expect(messages(model(turned), ONLY_26_3)[0]).toContain('0, 90, 180 o 270')
  })

  it('gates element rotations by version', () => {
    const tilted = (angle: number) =>
      model(cube({ rotation: { origin: [8, 8, 8], axis: 'y', angle } }))
    expect(messages(tilted(22.5), FROM_1_21)).toEqual([])
    expect(messages(tilted(30), FROM_1_21)[0]).toContain('solo 0, ±22,5 e ±45')
    expect(messages(tilted(30), { min: { major: 63, minor: 0 }, max: ONLY_26_3.max })).toEqual([])
    expect(messages(tilted(60), { min: { major: 63, minor: 0 }, max: ONLY_26_3.max })[0]).toContain(
      'oltre ±45°'
    )
    expect(messages(tilted(60), ONLY_26_3)).toEqual([])
    const euler = model(cube({ rotation: { origin: [8, 8, 8], x: 30, y: 10 } }))
    expect(messages(euler, ONLY_26_3)).toEqual([])
    expect(messages(euler, FROM_1_21)[0]).toContain('1.21.11')
  })

  it('warns about fields an older or newer version ignores', () => {
    const lit = model(cube({ light_emission: 7 }))
    expect(
      messages(lit, { min: { major: 34, minor: 0 }, max: ONLY_26_3.max }, 'warning')[0]
    ).toContain('1.21.2')
    expect(messages(model(cube({ light_emission: 16 })), ONLY_26_3)[0]).toContain('da 0 a 15')
    // shade: false alone is lost from 26.3, the override alone before it; both are fine.
    expect(messages(model(cube({ shade: false })), FROM_1_21, 'warning')[0]).toContain('26.3')
    expect(messages(model(cube({ shade: false })), OLD_ONLY, 'warning')).toEqual([])
    expect(
      messages(model(cube({ shade_direction_override: 'up' })), FROM_1_21, 'warning')[0]
    ).toContain('"shade": false')
    const both = model(cube({ shade: false, shade_direction_override: 'up' }))
    expect(checkModel(both, FROM_1_21)).toEqual([])
  })

  it('texture objects and display limits', () => {
    const translucent = { textures: { all: { sprite: 'block/glass', force_translucent: true } } }
    expect(messages(translucent, ONLY_26_3)).toEqual([])
    expect(messages(translucent, FROM_1_21)[0]).toContain('26.1')
    const display = { display: { gui: { translation: [0, 90, 0], scale: [5, 5, 5] }, hand: {} } }
    expect(messages(display, ONLY_26_3, 'warning')).toHaveLength(3)
  })

  it('names the first release of a feature', () => {
    expect(firstRelease(MODEL_FEATURES.multiAxis)).toBe('1.21.11')
    expect(firstRelease(MODEL_FEATURES.freeAngles)).toBe('1.21.6')
    expect(firstRelease(MODEL_FEATURES.shadeOverride)).toBe('26.3')
  })
})

describe('modelCost', () => {
  it('counts elements and faces, flags models heavier than any vanilla block', () => {
    expect(modelCost(model(cube(), cube()))).toEqual({ elements: 2, faces: 4 })
    const heavy = model(
      ...Array.from({ length: 11 }, () =>
        cube({ faces: { north: face, south: face, east: face, west: face, up: face, down: face } })
      )
    )
    expect(modelCost(heavy).faces).toBe(66)
    expect(messages(heavy, ONLY_26_3, 'info')[0]).toContain('66 facce')
  })
})
