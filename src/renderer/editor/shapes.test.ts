import { describe, expect, it } from 'vitest'
import type { Point } from './pixels'
import { constrainEnd, shapePoints } from './shapes'

/** Renders points into rows of '#' and '.' over a w×h grid. */
function render(points: Point[], w: number, h: number): string[] {
  const set = new Set(points.map((p) => `${p.x},${p.y}`))
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (set.has(`${x},${y}`) ? '#' : '.')).join('')
  )
}

describe('shapePoints', () => {
  it('draws rectangles as outline or filled, from any drag direction', () => {
    expect(render(shapePoints('rect', { x: 3, y: 2 }, { x: 0, y: 0 }, false), 5, 4)).toEqual([
      '####.',
      '#..#.',
      '####.',
      '.....'
    ])
    expect(shapePoints('rect', { x: 0, y: 0 }, { x: 2, y: 1 }, true)).toHaveLength(6)
  })

  it('draws a symmetric circle that touches its box', () => {
    const rows = render(shapePoints('ellipse', { x: 0, y: 0 }, { x: 6, y: 6 }, false), 7, 7)
    expect(rows).toEqual([
      '..###..',
      '.#...#.',
      '#.....#',
      '#.....#',
      '#.....#',
      '.#...#.',
      '..###..'
    ])
    // Mirror symmetry both ways.
    expect(rows).toEqual([...rows].reverse())
    expect(rows.map((r) => [...r].reverse().join(''))).toEqual(rows)
  })

  it('fills ellipses row by row without holes', () => {
    const rows = render(shapePoints('ellipse', { x: 0, y: 0 }, { x: 6, y: 4 }, true), 7, 5)
    for (const row of rows) expect(row.replace(/^\.*|\.*$/g, '')).not.toContain('.')
    expect(rows[2]).toBe('#######')
  })

  it('handles degenerate ellipses (a line or a point)', () => {
    expect(render(shapePoints('ellipse', { x: 0, y: 1 }, { x: 4, y: 1 }, false), 5, 3)[1]).toBe(
      '#####'
    )
    expect(shapePoints('ellipse', { x: 2, y: 2 }, { x: 2, y: 2 }, false)).toEqual([{ x: 2, y: 2 }])
  })

  it('draws lines with Bresenham', () => {
    expect(render(shapePoints('line', { x: 0, y: 0 }, { x: 3, y: 3 }, false), 4, 4)).toEqual([
      '#...',
      '.#..',
      '..#.',
      '...#'
    ])
  })
})

describe('constrainEnd', () => {
  it('snaps lines to 0°, 90° and 45°', () => {
    expect(constrainEnd('line', { x: 0, y: 0 }, { x: 10, y: 2 })).toEqual({ x: 10, y: 0 })
    expect(constrainEnd('line', { x: 0, y: 0 }, { x: 1, y: -9 })).toEqual({ x: 0, y: -9 })
    expect(constrainEnd('line', { x: 0, y: 0 }, { x: 6, y: -5 })).toEqual({ x: 6, y: -6 })
  })

  it('makes squares and circles, keeping the drag direction', () => {
    expect(constrainEnd('rect', { x: 5, y: 5 }, { x: 1, y: 7 })).toEqual({ x: 1, y: 9 })
    expect(constrainEnd('ellipse', { x: 0, y: 0 }, { x: 3, y: 8 })).toEqual({ x: 8, y: 8 })
  })
})
