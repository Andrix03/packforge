// Pure pixel operations on RGBA buffers (same layout as ImageData), used by the editor tools.

export type Rgba = readonly [number, number, number, number]

export const TRANSPARENT: Rgba = [0, 0, 0, 0]

/** Structural subset of ImageData so tests don't need a DOM. */
export interface PixelBuffer {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}

export interface PixelChange {
  /** Pixel index: y * width + x. */
  index: number
  before: Rgba
  after: Rgba
}

export interface Point {
  x: number
  y: number
}

export function getPixel(buffer: PixelBuffer, x: number, y: number): Rgba {
  const i = (y * buffer.width + x) * 4
  const d = buffer.data
  return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!]
}

/** Writes `color` as-is (no blending: pixel art replaces pixels). Returns true if it changed. */
export function setPixel(buffer: PixelBuffer, x: number, y: number, color: Rgba): boolean {
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return false
  const i = (y * buffer.width + x) * 4
  const d = buffer.data
  // Fully transparent pixels are stored as 0,0,0,0 so erasing is canonical.
  const [r, g, b, a] = color[3] === 0 ? TRANSPARENT : color
  if (d[i] === r && d[i + 1] === g && d[i + 2] === b && d[i + 3] === a) return false
  d[i] = r
  d[i + 1] = g
  d[i + 2] = b
  d[i + 3] = a
  return true
}

/** Pixels of a straight line (Bresenham), both ends included. */
export function linePoints(from: Point, to: Point): Point[] {
  const points: Point[] = []
  let { x, y } = from
  const dx = Math.abs(to.x - x)
  const dy = -Math.abs(to.y - y)
  const sx = x < to.x ? 1 : -1
  const sy = y < to.y ? 1 : -1
  let error = dx + dy
  for (;;) {
    points.push({ x, y })
    if (x === to.x && y === to.y) return points
    const doubled = 2 * error
    if (doubled >= dy) {
      error += dy
      x += sx
    }
    if (doubled <= dx) {
      error += dx
      y += sy
    }
  }
}

/**
 * What a stroke writes: a fixed color (pencil, eraser) or a function of the pixel's color before
 * the stroke (shade tool; null leaves the pixel alone). A function is applied once per pixel per
 * stroke, so going back and forth over a pixel doesn't keep darkening it.
 */
export type StrokePaint = Rgba | ((before: Rgba) => Rgba | null)

/**
 * One brush stroke. Pointer samples are joined with lines so fast moves leave no gaps; each point
 * stamps a square brush of `size` pixels (centered on odd sizes; even sizes extend right/down).
 * In pixel-perfect mode (1-pixel fixed-color brush only), L-shaped corners (two orthogonal steps
 * that could be one diagonal step) lose their middle pixel, which is restored to its color from
 * before the stroke: this keeps hand-drawn lines one pixel thin, as pixel artists do by hand.
 */
export class Stroke {
  private readonly path: Point[] = []
  /** Color of each touched pixel before the stroke, keyed by pixel index. */
  private readonly originals = new Map<number, Rgba>()
  private readonly pixelPerfect: boolean

  constructor(
    private readonly buffer: PixelBuffer,
    private readonly paintWith: StrokePaint,
    pixelPerfect: boolean,
    private readonly size = 1
  ) {
    this.pixelPerfect = pixelPerfect && size === 1 && typeof paintWith !== 'function'
  }

  /** Adds a pointer sample; returns true if any pixel changed. */
  add(point: Point): boolean {
    const last = this.path.at(-1)
    const segment = last ? linePoints(last, point).slice(1) : [point]
    let changed = false
    for (const p of segment) {
      this.path.push(p)
      changed = this.stamp(p) || changed
      if (this.pixelPerfect) changed = this.removeCorner() || changed
    }
    return changed
  }

  /** Pixels whose color differs from before the stroke, for the undo history. */
  changes(): PixelChange[] {
    const changes: PixelChange[] = []
    for (const [index, before] of this.originals) {
      const after = getPixel(
        this.buffer,
        index % this.buffer.width,
        Math.floor(index / this.buffer.width)
      )
      if (after.some((value, i) => value !== before[i])) changes.push({ index, before, after })
    }
    return changes
  }

  private stamp(center: Point): boolean {
    const offset = Math.floor((this.size - 1) / 2)
    let changed = false
    for (let dy = 0; dy < this.size; dy++) {
      for (let dx = 0; dx < this.size; dx++) {
        changed = this.paint(center.x - offset + dx, center.y - offset + dy) || changed
      }
    }
    return changed
  }

  private paint(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.buffer.width || y >= this.buffer.height) return false
    const index = y * this.buffer.width + x
    const seen = this.originals.has(index)
    if (!seen) this.originals.set(index, getPixel(this.buffer, x, y))
    if (typeof this.paintWith !== 'function') return setPixel(this.buffer, x, y, this.paintWith)
    if (seen) return false
    const color = this.paintWith(this.originals.get(index)!)
    return color ? setPixel(this.buffer, x, y, color) : false
  }

  private removeCorner(): boolean {
    const n = this.path.length
    if (n < 3) return false
    const a = this.path[n - 3]!
    const b = this.path[n - 2]!
    const c = this.path[n - 1]!
    const isCorner =
      Math.abs(a.x - c.x) === 1 &&
      Math.abs(a.y - c.y) === 1 &&
      (b.x === a.x || b.y === a.y) &&
      (b.x === c.x || b.y === c.y)
    if (!isCorner) return false
    // Keep b if the stroke passed over it earlier (it was painted on purpose).
    if (this.path.slice(0, n - 3).some((p) => p.x === b.x && p.y === b.y)) return false
    this.path.splice(n - 2, 1)
    const original = this.originals.get(b.y * this.buffer.width + b.x)
    return original ? setPixel(this.buffer, b.x, b.y, original) : false
  }
}

/** `#rrggbb` of a color, ignoring alpha (for `<input type="color">`). */
export function toHex([r, g, b]: Rgba): string {
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
}

/** Parses `#rrggbb` or `#rrggbbaa` (`#` optional, case-insensitive), or null if malformed. */
export function fromHex(hex: string): Rgba | null {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(hex.trim())
  if (!match) return null
  const [r, g, b, a] = match.slice(1).map((part) => (part === undefined ? 255 : parseInt(part, 16)))
  return [r!, g!, b!, a!]
}

export type FillMode = 'contiguous' | 'global'

/**
 * Paint bucket. `contiguous` fills the 4-connected area of exactly the same color as (x, y)
 * (diagonals don't leak, as in pixel-art editors); `global` replaces that color everywhere.
 * Applies the fill and returns the changed pixels for the undo history.
 */
export function fill(
  buffer: PixelBuffer,
  x: number,
  y: number,
  color: Rgba,
  mode: FillMode
): PixelChange[] {
  return paintPixels(buffer, fillRegion(buffer, x, y, mode), () => color)
}

/** Indices of the pixels the bucket would fill from (x, y); empty outside the buffer. */
export function fillRegion(buffer: PixelBuffer, x: number, y: number, mode: FillMode): number[] {
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return []
  const target = getPixel(buffer, x, y)
  const total = buffer.width * buffer.height
  const matches = (index: number): boolean => sameColor(buffer, index, target)
  const region: number[] = []

  if (mode === 'global') {
    for (let index = 0; index < total; index++) if (matches(index)) region.push(index)
    return region
  }

  const visited = new Uint8Array(total)
  const stack = [y * buffer.width + x]
  visited[stack[0]!] = 1
  while (stack.length > 0) {
    const index = stack.pop()!
    region.push(index)
    const px = index % buffer.width
    const neighbors = [
      px > 0 ? index - 1 : -1,
      px < buffer.width - 1 ? index + 1 : -1,
      index - buffer.width,
      index + buffer.width
    ]
    for (const n of neighbors) {
      if (n < 0 || n >= total || visited[n] || !matches(n)) continue
      visited[n] = 1
      stack.push(n)
    }
  }
  return region
}

/** Sets each pixel to `colorFor(index)`; returns what changed (with the real previous colors). */
export function paintPixels(
  buffer: PixelBuffer,
  indices: readonly number[],
  colorFor: (index: number) => Rgba
): PixelChange[] {
  const changes: PixelChange[] = []
  for (const index of indices) {
    const x = index % buffer.width
    const y = Math.floor(index / buffer.width)
    const before = getPixel(buffer, x, y)
    if (setPixel(buffer, x, y, colorFor(index))) {
      changes.push({ index, before, after: getPixel(buffer, x, y) })
    }
  }
  return changes
}

/** Exact RGBA match; every fully transparent pixel counts as the same color. */
function sameColor(buffer: PixelBuffer, index: number, color: Rgba): boolean {
  const d = buffer.data
  const i = index * 4
  if (color[3] === 0) return d[i + 3] === 0
  return (
    d[i] === color[0] && d[i + 1] === color[1] && d[i + 2] === color[2] && d[i + 3] === color[3]
  )
}
