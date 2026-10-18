// Pixel-art shape rasterization: lines, rectangles and ellipses between two points (the drag
// start and the current pointer). Points may be outside the texture; painting clips them.

import { linePoints, type Point } from './pixels'

export type ShapeKind = 'line' | 'rect' | 'ellipse'

/**
 * With Shift: lines snap to horizontal, vertical or 45°; rectangles and ellipses become squares and
 * circles (the larger side wins, keeping the drag direction).
 */
export function constrainEnd(kind: ShapeKind, start: Point, end: Point): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (kind === 'line') {
    const ax = Math.abs(dx)
    const ay = Math.abs(dy)
    if (ax > 2 * ay) return { x: end.x, y: start.y }
    if (ay > 2 * ax) return { x: start.x, y: end.y }
    const d = Math.max(ax, ay)
    return { x: start.x + Math.sign(dx) * d, y: start.y + Math.sign(dy) * d }
  }
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return { x: start.x + (dx < 0 ? -side : side), y: start.y + (dy < 0 ? -side : side) }
}

export function shapePoints(kind: ShapeKind, a: Point, b: Point, filled: boolean): Point[] {
  if (kind === 'line') return linePoints(a, b)
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  return kind === 'rect'
    ? rectPoints(x0, y0, x1, y1, filled)
    : ellipsePoints(x0, y0, x1, y1, filled)
}

function rectPoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const points: Point[] = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (filled || y === y0 || y === y1 || x === x0 || x === x1) points.push({ x, y })
    }
  }
  return points
}

/**
 * Ellipse inscribed in the pixel rectangle [x0..x1] × [y0..y1] (Bresenham-style, after Alois
 * Zingl's "plotEllipseRect"): symmetric, touches all four sides, no doubled pixels on the outline.
 */
function ellipsePoints(x0: number, y0: number, x1: number, y1: number, filled: boolean): Point[] {
  const outline = new Map<string, Point>()
  const add = (x: number, y: number): void => {
    outline.set(`${x},${y}`, { x, y })
  }
  let a = Math.abs(x1 - x0)
  const b = Math.abs(y1 - y0)
  let b1 = b & 1
  let dx = 4 * (1 - a) * b * b
  let dy = 4 * (b1 + 1) * a * a
  let err = dx + dy + b1 * a * a
  let left = x0
  let right = x1
  let top = y0 + ((b + 1) >> 1)
  let bottom = top - b1
  a *= 8 * a
  b1 = 8 * b * b
  do {
    add(right, top)
    add(left, top)
    add(left, bottom)
    add(right, bottom)
    const e2 = 2 * err
    if (e2 <= dy) {
      top++
      bottom--
      err += dy += a
    }
    if (e2 >= dx || 2 * err > dy) {
      left++
      right--
      err += dx += b1
    }
  } while (left <= right)
  // Flat ellipses: finish the tips.
  while (top - bottom <= b) {
    add(left - 1, top)
    add(right + 1, top++)
    add(left - 1, bottom)
    add(right + 1, bottom--)
  }
  if (!filled) return [...outline.values()]
  // Filled: every pixel between the leftmost and rightmost outline pixel of each row.
  const rows = new Map<number, { min: number; max: number }>()
  for (const { x, y } of outline.values()) {
    const row = rows.get(y)
    if (!row) rows.set(y, { min: x, max: x })
    else {
      row.min = Math.min(row.min, x)
      row.max = Math.max(row.max, x)
    }
  }
  const points: Point[] = []
  for (const [y, { min, max }] of rows) for (let x = min; x <= max; x++) points.push({ x, y })
  return points
}
