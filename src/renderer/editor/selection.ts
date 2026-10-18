// Selections and floating content (moved/pasted pixels) for the editor. Pure.
//
// A selection is a mask over the texture. Moving, pasting, flipping or rotating works on a
// "floating" piece: pixels lifted out of the layer that hover above it until they are dropped.

import {
  getPixel,
  setPixel,
  TRANSPARENT,
  type PixelBuffer,
  type PixelChange,
  type Point
} from './pixels'

export interface Bounds {
  /** Inclusive pixel bounds. */
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Selection {
  width: number
  height: number
  /** 1 = selected, one byte per pixel. */
  mask: Uint8Array
  bounds: Bounds
}

export interface Floating {
  /** Texture position of the floating piece's top-left pixel (may be outside the texture). */
  x: number
  y: number
  width: number
  height: number
  /** RGBA of the piece. */
  data: Uint8ClampedArray
  /** Which pixels of the piece are part of it (the selection shape). */
  mask: Uint8Array
}

/** Rectangle between two points, clamped to the texture; null when it misses the texture. */
export function rectSelection(width: number, height: number, a: Point, b: Point): Selection | null {
  const x0 = Math.max(0, Math.min(a.x, b.x))
  const y0 = Math.max(0, Math.min(a.y, b.y))
  const x1 = Math.min(width - 1, Math.max(a.x, b.x))
  const y1 = Math.min(height - 1, Math.max(a.y, b.y))
  if (x0 > x1 || y0 > y1) return null
  const mask = new Uint8Array(width * height)
  for (let y = y0; y <= y1; y++) mask.fill(1, y * width + x0, y * width + x1 + 1)
  return { width, height, mask, bounds: { x0, y0, x1, y1 } }
}

export function allSelection(width: number, height: number): Selection {
  return rectSelection(width, height, { x: 0, y: 0 }, { x: width - 1, y: height - 1 })!
}

/** Selection from pixel indices (magic wand); null when empty. */
export function maskSelection(
  width: number,
  height: number,
  indices: readonly number[]
): Selection | null {
  if (indices.length === 0) return null
  const mask = new Uint8Array(width * height)
  for (const index of indices) mask[index] = 1
  return { width, height, mask, bounds: boundsOf(mask, width, height)! }
}

export function isSelected(selection: Selection, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= selection.width || y >= selection.height) return false
  return selection.mask[y * selection.width + x] === 1
}

function boundsOf(mask: Uint8Array, width: number, height: number): Bounds | null {
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
  }
  return x1 === -1 ? null : { x0, y0, x1, y1 }
}

/** Copy of the selected pixels as a floating piece at their current position. */
export function extract(buffer: PixelBuffer, selection: Selection): Floating {
  const { x0, y0, x1, y1 } = selection.bounds
  const width = x1 - x0 + 1
  const height = y1 - y0 + 1
  const data = new Uint8ClampedArray(width * height * 4)
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isSelected(selection, x0 + x, y0 + y)) continue
      mask[y * width + x] = 1
      data.set(getPixel(buffer, x0 + x, y0 + y), (y * width + x) * 4)
    }
  }
  return { x: x0, y: y0, width, height, data, mask }
}

/** Makes the selected pixels transparent (Delete, cut, lift for moving). */
export function clearSelected(buffer: PixelBuffer, selection: Selection): PixelChange[] {
  const changes: PixelChange[] = []
  const { x0, y0, x1, y1 } = selection.bounds
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!isSelected(selection, x, y)) continue
      const before = getPixel(buffer, x, y)
      if (setPixel(buffer, x, y, TRANSPARENT)) {
        changes.push({ index: y * buffer.width + x, before, after: TRANSPARENT })
      }
    }
  }
  return changes
}

/**
 * Writes the floating piece into a buffer: its pixels REPLACE what is below (pixel art; fully
 * transparent pixels of the piece leave the layer unchanged). Parts outside the texture are dropped.
 */
export function stampFloating(buffer: PixelBuffer, floating: Floating): void {
  for (let y = 0; y < floating.height; y++) {
    for (let x = 0; x < floating.width; x++) {
      const i = y * floating.width + x
      if (!floating.mask[i] || floating.data[i * 4 + 3] === 0) continue
      const tx = floating.x + x
      const ty = floating.y + y
      if (tx < 0 || ty < 0 || tx >= buffer.width || ty >= buffer.height) continue
      const d = floating.data
      setPixel(buffer, tx, ty, [d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!, d[i * 4 + 3]!])
    }
  }
}

/** The selection covering the floating piece where it is now (null if fully outside). */
export function floatingSelection(
  floating: Floating,
  width: number,
  height: number
): Selection | null {
  const indices: number[] = []
  for (let y = 0; y < floating.height; y++) {
    for (let x = 0; x < floating.width; x++) {
      if (!floating.mask[y * floating.width + x]) continue
      const tx = floating.x + x
      const ty = floating.y + y
      if (tx >= 0 && ty >= 0 && tx < width && ty < height) indices.push(ty * width + tx)
    }
  }
  return maskSelection(width, height, indices)
}

export function moveFloating(floating: Floating, dx: number, dy: number): Floating {
  return { ...floating, x: floating.x + dx, y: floating.y + dy }
}

/** Mirror image of the piece in place: 'h' = left ↔ right, 'v' = top ↕ bottom. */
export function flipFloating(floating: Floating, axis: 'h' | 'v'): Floating {
  return remap(floating, floating.width, floating.height, (x, y) =>
    axis === 'h' ? [floating.width - 1 - x, y] : [x, floating.height - 1 - y]
  )
}

/** 90° clockwise around the piece's center; trunc keeps 4 rotations drift-free. */
export function rotateFloating(floating: Floating): Floating {
  const rotated = remap(floating, floating.height, floating.width, (x, y) => [
    y,
    floating.height - 1 - x
  ])
  return {
    ...rotated,
    x: floating.x + Math.trunc((floating.width - floating.height) / 2),
    y: floating.y + Math.trunc((floating.height - floating.width) / 2)
  }
}

/** New piece of size w×h where pixel (x, y) comes from `source(x, y)` of the old one. */
function remap(
  floating: Floating,
  width: number,
  height: number,
  source: (x: number, y: number) => [number, number]
): Floating {
  const data = new Uint8ClampedArray(width * height * 4)
  const mask = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [sx, sy] = source(x, y)
      const from = sy * floating.width + sx
      const to = y * width + x
      mask[to] = floating.mask[from]!
      data.set(floating.data.subarray(from * 4, from * 4 + 4), to * 4)
    }
  }
  return { x: floating.x, y: floating.y, width, height, data, mask }
}

/**
 * Edges between selected and unselected pixels, as unit segments [x1, y1, x2, y2] in pixel
 * coordinates (for the marching-ants outline).
 */
export function outlineSegments(
  mask: Uint8Array,
  width: number,
  height: number,
  offsetX = 0,
  offsetY = 0
): Array<[number, number, number, number]> {
  const segments: Array<[number, number, number, number]> = []
  const on = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!on(x, y)) continue
      const X = x + offsetX
      const Y = y + offsetY
      if (!on(x, y - 1)) segments.push([X, Y, X + 1, Y])
      if (!on(x, y + 1)) segments.push([X, Y + 1, X + 1, Y + 1])
      if (!on(x - 1, y)) segments.push([X, Y, X, Y + 1])
      if (!on(x + 1, y)) segments.push([X + 1, Y, X + 1, Y + 1])
    }
  }
  return segments
}
