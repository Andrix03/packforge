import { describe, expect, it } from 'vitest'
import { buildQuads } from './blockGeometry'
import { resolveModel } from './blockModel'
import { checkModel } from './modelRules'
import { ALL_FACES, popOutModel } from './popOut'

const RANGE = { min: { major: 34, minor: 0 }, max: { major: 94, minor: 0 } }

describe('pixels that pop out', () => {
  it('raises one pixel on the north face over that same pixel', async () => {
    const result = popOutModel(16, 16, (x, y) => x === 3 && y === 5, 'minecraft:block/iron_ore', {
      depth: 1,
      faces: ['north']
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.elements).toBe(2)
    // Cube (6) + front and four sides.
    expect(result.faces).toBe(11)
    const piece = (result.model['elements'] as Array<Record<string, unknown>>)[1]!
    expect(piece['from']).toEqual([12, 10, -1])
    expect(piece['to']).toEqual([13, 11, 0])
    // Through the game's default UV the front face shows pixel (3, 5).
    const resolved = await resolveModel('test:block/x', async (path) =>
      path.endsWith('block/x.json') ? result.model : { elements: [] }
    )
    const front = buildQuads(resolved, { x: 0, y: 0 }).find(
      (q) => q.normal[2] === -1 && q.positions.every((p) => p[2] === -1)
    )
    const us = front!.uvs.map((uv) => uv[0])
    const vs = front!.uvs.map((uv) => uv[1])
    expect([Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]).toEqual([
      3, 4, 5, 6
    ])
  })

  it('merges neighbouring pixels and drops the sides between them', () => {
    const result = popOutModel(16, 16, (x, y) => y === 2 && x >= 4 && x <= 6, 'b', {
      depth: 1,
      faces: ['up']
    })
    expect(result.ok && result.elements).toBe(2)
  })

  it('writes a model the game accepts, on every face, culled like its face', () => {
    const result = popOutModel(
      16,
      16,
      (x, y) => (x + y) % 5 === 0 && x > 2 && x < 12,
      'minecraft:block/diamond_ore',
      { depth: 1, faces: ALL_FACES }
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(checkModel(result.model, RANGE).filter((i) => i.severity === 'error')).toEqual([])
    const elements = result.model['elements'] as Array<{
      faces: Record<string, { cullface: string }>
    }>
    for (const element of elements.slice(1)) {
      const culls = new Set(Object.values(element.faces).map((f) => f.cullface))
      expect(culls.size).toBe(1)
    }
  })

  it('refuses an empty choice', () => {
    expect(popOutModel(16, 16, () => false, 'b', { depth: 1, faces: ALL_FACES }).ok).toBe(false)
  })
})
