import { describe, expect, it } from 'vitest'
import { extrudeModel, opaqueRects } from './extrude'
import { checkModel } from './modelRules'

const ALL = { min: { major: 34, minor: 0 }, max: { major: 97, minor: 1 } }
/** A sprite from rows of '#' (opaque) and '.' (transparent). */
const sprite = (rows: string[]) => ({
  width: rows[0]!.length,
  height: rows.length,
  opaque: (x: number, y: number) => rows[y]![x] === '#'
})

describe('opaqueRects', () => {
  it('covers every opaque pixel exactly once with few rectangles', () => {
    const s = sprite(['##..', '##..', '####', '.#..'])
    const rects = opaqueRects(s.width, s.height, s.opaque)
    const covered = new Map<string, number>()
    for (const r of rects)
      for (let y = r.y; y < r.y + r.height; y++)
        for (let x = r.x; x < r.x + r.width; x++)
          covered.set(`${x},${y}`, (covered.get(`${x},${y}`) ?? 0) + 1)
    expect([...covered.values()].every((n) => n === 1)).toBe(true)
    expect(covered.size).toBe(9)
    expect(rects.length).toBeLessThanOrEqual(4)
  })
})

describe('extrudeModel', () => {
  it('a full square is one cube; the model is valid for every version', () => {
    const s = sprite(Array.from({ length: 16 }, () => '#'.repeat(16)))
    const result = extrudeModel(s.width, s.height, s.opaque, 'minecraft:item/apple')
    if (!result.ok) throw new Error(result.error)
    expect(result.elements).toBe(1)
    expect(result.faces).toBe(6)
    expect((result.model['elements'] as Array<{ from: number[]; to: number[] }>)[0]).toMatchObject({
      from: [0, 0, 7.5],
      to: [16, 16, 8.5]
    })
    expect(checkModel(result.model, ALL)).toEqual([])
  })

  it('inner sides are left out; front UVs map the texture (rows go down, y goes up)', () => {
    const s = sprite(['#.', '##'])
    const result = extrudeModel(s.width, s.height, s.opaque, 'item/x', { thickness: 2, budget: 10 })
    if (!result.ok) throw new Error(result.error)
    const elements = result.model['elements'] as Array<{
      from: number[]
      faces: Record<string, { uv: number[] }>
    }>
    expect(elements).toHaveLength(2)
    // The top-left column (x 0, rows 0–1) sits at the left, from the bottom to the top.
    expect(elements[0]!.from).toEqual([0, 0, 7])
    expect(elements[0]!.faces['south']!.uv).toEqual([0, 0, 8, 16])
    // The lower right pixel touches the column on its west side: no west face there.
    expect(elements[1]!.faces['west']).toBeUndefined()
    expect(checkModel(result.model, ALL).filter((i) => i.severity === 'error')).toEqual([])
  })

  it('refuses empty sprites and ones that need more elements than the budget', () => {
    const empty = sprite(['..', '..'])
    expect(extrudeModel(2, 2, empty.opaque, 'x').ok).toBe(false)
    const checker = sprite(['#.#.', '.#.#', '#.#.', '.#.#'])
    const result = extrudeModel(4, 4, checker.opaque, 'x', { thickness: 1, budget: 4 })
    expect(result.ok || result.error).toContain('8 elementi')
  })
})
