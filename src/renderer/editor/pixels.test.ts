import { describe, expect, it } from 'vitest'
import {
  getPixel,
  linePoints,
  setPixel,
  fromHex,
  Stroke,
  toHex,
  TRANSPARENT,
  type PixelBuffer,
  type Rgba
} from './pixels'

const RED: Rgba = [255, 0, 0, 255]
const GRAY: Rgba = [100, 100, 100, 255]

function buffer(width: number, height: number, fill: Rgba = TRANSPARENT): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(fill, i * 4)
  return { width, height, data }
}

/** Rows of the buffer as strings: '#' = color, '.' = anything else. */
function render(b: PixelBuffer, color: Rgba = RED): string[] {
  const rows: string[] = []
  for (let y = 0; y < b.height; y++) {
    let row = ''
    for (let x = 0; x < b.width; x++) {
      row += getPixel(b, x, y).every((v, i) => v === color[i]) ? '#' : '.'
    }
    rows.push(row)
  }
  return rows
}

describe('setPixel', () => {
  it('replaces the pixel and reports changes', () => {
    const b = buffer(2, 2)
    expect(setPixel(b, 1, 0, RED)).toBe(true)
    expect(getPixel(b, 1, 0)).toEqual(RED)
    expect(setPixel(b, 1, 0, RED)).toBe(false)
  })

  it('ignores pixels outside the buffer', () => {
    const b = buffer(2, 2)
    expect(setPixel(b, 2, 0, RED)).toBe(false)
    expect(setPixel(b, -1, 0, RED)).toBe(false)
  })

  it('stores any fully transparent color as 0,0,0,0', () => {
    const b = buffer(1, 1, RED)
    setPixel(b, 0, 0, [12, 34, 56, 0])
    expect(getPixel(b, 0, 0)).toEqual(TRANSPARENT)
  })

  it('writes semi-transparent colors without blending', () => {
    const b = buffer(1, 1, RED)
    setPixel(b, 0, 0, [0, 0, 255, 128])
    expect(getPixel(b, 0, 0)).toEqual([0, 0, 255, 128])
  })
})

describe('linePoints', () => {
  it('includes both ends and is continuous', () => {
    const points = linePoints({ x: 0, y: 0 }, { x: 5, y: 2 })
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points.at(-1)).toEqual({ x: 5, y: 2 })
    for (let i = 1; i < points.length; i++) {
      expect(Math.abs(points[i]!.x - points[i - 1]!.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(points[i]!.y - points[i - 1]!.y)).toBeLessThanOrEqual(1)
    }
  })

  it('handles single points and reverse directions', () => {
    expect(linePoints({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([{ x: 3, y: 3 }])
    expect(linePoints({ x: 2, y: 0 }, { x: 0, y: 0 })).toEqual([
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 }
    ])
  })
})

describe('Stroke', () => {
  it('fills the gaps between fast pointer samples', () => {
    const b = buffer(6, 1)
    const stroke = new Stroke(b, RED, false)
    stroke.add({ x: 0, y: 0 })
    stroke.add({ x: 5, y: 0 })
    expect(render(b)).toEqual(['######'])
  })

  it('erases with the transparent color', () => {
    const b = buffer(3, 1, RED)
    const stroke = new Stroke(b, TRANSPARENT, false)
    stroke.add({ x: 0, y: 0 })
    stroke.add({ x: 1, y: 0 })
    expect(render(b)).toEqual(['..#'])
    expect(getPixel(b, 0, 0)).toEqual(TRANSPARENT)
  })

  it('keeps L-shaped corners without pixel-perfect', () => {
    const b = buffer(3, 3)
    const stroke = new Stroke(b, RED, false)
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 }
    ]) {
      stroke.add(p)
    }
    expect(render(b)).toEqual(['##.', '.##', '..#'])
  })

  it('removes L-shaped corners in pixel-perfect mode and restores what was under them', () => {
    const b = buffer(3, 3, GRAY)
    const stroke = new Stroke(b, RED, true)
    for (const p of [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 }
    ]) {
      stroke.add(p)
    }
    expect(render(b)).toEqual(['#..', '.#.', '..#'])
    expect(getPixel(b, 1, 0)).toEqual(GRAY)
    expect(getPixel(b, 2, 1)).toEqual(GRAY)
  })

  it('keeps straight lines intact in pixel-perfect mode', () => {
    const b = buffer(4, 2)
    const stroke = new Stroke(b, RED, true)
    stroke.add({ x: 0, y: 0 })
    stroke.add({ x: 3, y: 0 })
    stroke.add({ x: 3, y: 1 })
    expect(render(b)).toEqual(['###.', '...#'])
  })

  it('does not remove a corner pixel the stroke had already painted', () => {
    const b = buffer(3, 3)
    const stroke = new Stroke(b, RED, true)
    // Goes over (1,0) twice: the second pass must not erase it.
    for (const p of [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]) {
      stroke.add(p)
    }
    expect(getPixel(b, 1, 0)).toEqual(RED)
  })

  it('skips samples outside the canvas but keeps drawing when coming back', () => {
    const b = buffer(3, 1)
    const stroke = new Stroke(b, RED, false)
    stroke.add({ x: 0, y: 0 })
    stroke.add({ x: 5, y: 0 })
    expect(render(b)).toEqual(['###'])
  })

  it('reports whether the stroke really changed the image', () => {
    const b = buffer(2, 1, RED)
    const same = new Stroke(b, RED, false)
    same.add({ x: 0, y: 0 })
    expect(same.modified).toBe(false)
    const erase = new Stroke(b, TRANSPARENT, false)
    erase.add({ x: 1, y: 0 })
    expect(erase.modified).toBe(true)
  })
})

describe('toHex / fromHex', () => {
  it('round-trips opaque colors', () => {
    expect(toHex([255, 8, 160, 255])).toBe('#ff08a0')
    expect(fromHex('#FF08A0')).toEqual([255, 8, 160, 255])
  })

  it('rejects malformed input', () => {
    expect(fromHex('ff08a0')).toBeNull()
    expect(fromHex('#fff')).toBeNull()
    expect(fromHex('#gg0000')).toBeNull()
  })
})
