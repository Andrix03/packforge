// Pure pixel operations on RGBA buffers (same layout as ImageData), used by the editor tools.

export type Rgba = readonly [number, number, number, number]

export const TRANSPARENT: Rgba = [0, 0, 0, 0]

/** Structural subset of ImageData so tests don't need a DOM. */
export interface PixelBuffer {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
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
 * One pencil/eraser stroke. Pointer samples are joined with lines so fast moves leave no gaps.
 * In pixel-perfect mode, L-shaped corners (two orthogonal steps that could be one diagonal step)
 * lose their middle pixel, which is restored to its color from before the stroke: this keeps
 * hand-drawn lines one pixel thin, as pixel artists do by hand.
 */
export class Stroke {
  private readonly path: Point[] = []
  /** Color of each touched pixel before the stroke, keyed by pixel index. */
  private readonly originals = new Map<number, Rgba>()

  constructor(
    private readonly buffer: PixelBuffer,
    private readonly color: Rgba,
    private readonly pixelPerfect: boolean
  ) {}

  /** Adds a pointer sample; returns true if any pixel changed. */
  add(point: Point): boolean {
    const last = this.path.at(-1)
    const segment = last ? linePoints(last, point).slice(1) : [point]
    let changed = false
    for (const p of segment) {
      if (p.x < 0 || p.y < 0 || p.x >= this.buffer.width || p.y >= this.buffer.height) {
        // Off-canvas samples break the L-corner chain but are not painted.
        this.path.push(p)
        continue
      }
      this.path.push(p)
      changed = this.paint(p) || changed
      if (this.pixelPerfect) changed = this.removeCorner() || changed
    }
    return changed
  }

  /** True if the stroke changed at least one pixel compared to before it started. */
  get modified(): boolean {
    for (const [index, before] of this.originals) {
      const now = getPixel(
        this.buffer,
        index % this.buffer.width,
        Math.floor(index / this.buffer.width)
      )
      if (now.some((value, i) => value !== before[i])) return true
    }
    return false
  }

  private paint(p: Point): boolean {
    const index = p.y * this.buffer.width + p.x
    if (!this.originals.has(index)) this.originals.set(index, getPixel(this.buffer, p.x, p.y))
    return setPixel(this.buffer, p.x, p.y, this.color)
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

/** Parses `#rrggbb` (case-insensitive) into an opaque color, or null if malformed. */
export function fromHex(hex: string): Rgba | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!match) return null
  return [parseInt(match[1]!, 16), parseInt(match[2]!, 16), parseInt(match[3]!, 16), 255]
}
