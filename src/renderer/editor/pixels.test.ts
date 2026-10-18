import { describe, expect, it } from 'vitest'
import {
  diffPixels,
  fill,
  fromHex,
  getPixel,
  linePoints,
  replacePixels,
  setPixel,
  Stroke,
  toHex,
  TRANSPARENT,
  type PixelBuffer,
  type Rgba
} from './pixels'

const RED: Rgba = [255, 0, 0, 255]
const GRAY: Rgba = [100, 100, 100, 255]
const BLUE_TEST: Rgba = [0, 0, 255, 255]

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

  it('stamps a square brush, centered on odd sizes', () => {
    const b = buffer(5, 5)
    new Stroke(b, RED, false, 3).add({ x: 2, y: 2 })
    expect(render(b)).toEqual(['.....', '.###.', '.###.', '.###.', '.....'])
    const even = buffer(4, 4)
    new Stroke(even, RED, false, 2).add({ x: 1, y: 1 })
    expect(render(even)).toEqual(['....', '.##.', '.##.', '....'])
  })

  it('paints the visible part of a brush at the edge', () => {
    const b = buffer(3, 3)
    new Stroke(b, RED, false, 3).add({ x: 0, y: 0 })
    expect(render(b)).toEqual(['##.', '##.', '...'])
  })

  it('applies a color function once per pixel per stroke', () => {
    const b = buffer(3, 1, GRAY)
    let calls = 0
    const darker = (before: Rgba): Rgba => {
      calls++
      return [before[0] - 10, before[1] - 10, before[2] - 10, 255]
    }
    const stroke = new Stroke(b, darker, true)
    stroke.add({ x: 0, y: 0 })
    stroke.add({ x: 2, y: 0 })
    stroke.add({ x: 0, y: 0 })
    expect(calls).toBe(3)
    expect(getPixel(b, 1, 0)).toEqual([90, 90, 90, 255])
  })

  it('leaves pixels alone when the color function returns null', () => {
    const b = buffer(2, 1, GRAY)
    new Stroke(b, () => null, false).add({ x: 0, y: 0 })
    expect(getPixel(b, 0, 0)).toEqual(GRAY)
  })

  it('mirrors across the vertical and horizontal center lines', () => {
    const b = buffer(4, 3)
    new Stroke(b, RED, { mirror: { x: true, y: false } }).add({ x: 0, y: 0 })
    expect(render(b)).toEqual(['#..#', '....', '....'])
    const both = buffer(4, 3)
    new Stroke(both, RED, { mirror: { x: true, y: true } }).add({ x: 1, y: 0 })
    expect(render(both)).toEqual(['.##.', '....', '.##.'])
  })

  it('paints only inside the clip', () => {
    const b = buffer(4, 1)
    const stroke = new Stroke(b, RED, { clip: (x) => x >= 2 })
    stroke.add({ x: 0, y: 0 })
    stroke.add({ x: 3, y: 0 })
    expect(render(b)).toEqual(['..##'])
  })

  it('wraps around the edges in seamless mode', () => {
    const b = buffer(4, 2)
    const stroke = new Stroke(b, RED, { wrap: true })
    stroke.add({ x: 2, y: 0 })
    stroke.add({ x: 5, y: 0 })
    expect(render(b)).toEqual(['####', '....'])
    new Stroke(b, BLUE_TEST, { wrap: true }).add({ x: -1, y: -1 })
    expect(getPixel(b, 3, 1)).toEqual(BLUE_TEST)
  })

  it('stamps shape points without joining them', () => {
    const b = buffer(5, 1)
    new Stroke(b, RED, {}).addPoints([
      { x: 0, y: 0 },
      { x: 4, y: 0 }
    ])
    expect(render(b)).toEqual(['#...#'])
  })

  it('lists only the pixels that really changed', () => {
    const b = buffer(3, 1, RED)
    const same = new Stroke(b, RED, false)
    same.add({ x: 0, y: 0 })
    expect(same.changes()).toEqual([])
    const erase = new Stroke(b, TRANSPARENT, false)
    erase.add({ x: 1, y: 0 })
    erase.add({ x: 2, y: 0 })
    expect(erase.changes()).toEqual([
      { index: 1, before: RED, after: TRANSPARENT },
      { index: 2, before: RED, after: TRANSPARENT }
    ])
  })

  it('does not list a pixel-perfect corner that was restored', () => {
    const b = buffer(2, 2, GRAY)
    const stroke = new Stroke(b, RED, true)
    stroke.add({ x: 0, y: 0 })
    stroke.add({ x: 1, y: 0 })
    stroke.add({ x: 1, y: 1 })
    expect(stroke.changes().map((c) => c.index)).toEqual([0, 3])
  })
})

describe('diffPixels', () => {
  it('lists the pixels that differ from a snapshot', () => {
    const b = buffer(2, 1, GRAY)
    const before = new Uint8ClampedArray(b.data)
    setPixel(b, 1, 0, RED)
    expect(diffPixels(b, before)).toEqual([{ index: 1, before: GRAY, after: RED }])
  })
})

describe('toHex / fromHex', () => {
  it('round-trips opaque colors', () => {
    expect(toHex([255, 8, 160, 255])).toBe('#ff08a0')
    expect(fromHex('#FF08A0')).toEqual([255, 8, 160, 255])
  })

  it('accepts a missing # and an alpha byte', () => {
    expect(fromHex('ff08a0')).toEqual([255, 8, 160, 255])
    expect(fromHex(' #FF08A080 ')).toEqual([255, 8, 160, 128])
  })

  it('rejects malformed input', () => {
    expect(fromHex('#ff08a')).toBeNull()
    expect(fromHex('#fff')).toBeNull()
    expect(fromHex('#gg0000')).toBeNull()
  })
})

describe('fill', () => {
  // Two gray regions split by a red wall; the right one touches the left only diagonally.
  function walled(): PixelBuffer {
    const b = buffer(4, 3, GRAY)
    for (const [x, y] of [
      [1, 0],
      [1, 1],
      [2, 1],
      [2, 2]
    ] as const) {
      setPixel(b, x, y, RED)
    }
    return b
  }
  const BLUE: Rgba = [0, 0, 255, 255]

  it('fills only the 4-connected area in contiguous mode', () => {
    const b = walled()
    const changes = fill(b, 0, 0, BLUE, 'contiguous')
    expect(render(b, BLUE)).toEqual(['#...', '#...', '##..'])
    expect(changes).toHaveLength(4)
    expect(changes[0]!.before).toEqual(GRAY)
  })

  it('replaces the color everywhere in global mode', () => {
    const b = walled()
    fill(b, 0, 0, BLUE, 'global')
    expect(render(b, BLUE)).toEqual(['#.##', '#..#', '##.#'])
  })

  it('does nothing when the color is already the same', () => {
    const b = walled()
    expect(fill(b, 0, 0, GRAY, 'contiguous')).toEqual([])
  })

  it('fills transparent areas whatever their stored RGB', () => {
    const b = buffer(2, 1, TRANSPARENT)
    b.data.set([9, 9, 9, 0], 4)
    fill(b, 0, 0, RED, 'contiguous')
    expect(render(b)).toEqual(['##'])
  })

  it('does not wrap around the left/right edges', () => {
    const b = buffer(2, 2, GRAY)
    setPixel(b, 1, 0, RED)
    setPixel(b, 0, 1, RED)
    // (1,1) is gray but touches (0,0) only diagonally.
    fill(b, 0, 0, BLUE, 'contiguous')
    expect(render(b, BLUE)).toEqual(['#.', '..'])
  })

  it('records the real previous color for undo, even for odd transparent pixels', () => {
    const b = buffer(1, 1, TRANSPARENT)
    b.data.set([9, 9, 9, 0])
    const [change] = fill(b, 0, 0, RED, 'contiguous')
    expect(change!.before).toEqual([9, 9, 9, 0])
  })

  it('replaces a whole image, listing only the changed pixels', () => {
    const b = buffer(2, 1, GRAY)
    const changes = replacePixels(b, Uint8Array.from([...GRAY, ...RED]))
    expect(changes).toEqual([{ index: 1, before: GRAY, after: RED }])
    expect(getPixel(b, 1, 0)).toEqual(RED)
  })

  it('continues across the edges in seamless mode', () => {
    // 4×1: gray, red wall, gray, gray → from x = 3 the area wraps around to x = 0.
    const b = buffer(4, 1, GRAY)
    setPixel(b, 1, 0, RED)
    const BLUE: Rgba = [0, 0, 255, 255]
    fill(b, 3, 0, BLUE, 'contiguous', null, true)
    expect(render(b, BLUE)).toEqual(['#.##'])
    const plain = buffer(4, 1, GRAY)
    setPixel(plain, 1, 0, RED)
    fill(plain, 3, 0, BLUE, 'contiguous')
    expect(render(plain, BLUE)).toEqual(['..##'])
  })

  it('ignores clicks outside the buffer', () => {
    expect(fill(buffer(2, 2), 5, 0, RED, 'global')).toEqual([])
  })
})

describe('bounds (animation frames)', () => {
  const RED_B: Rgba = [255, 0, 0, 255]

  it('keeps strokes, mirror and wrap inside the bounds', () => {
    // 4×4 image, editable area = rows 2..3 (second "frame").
    const bounds = { x0: 0, y0: 2, x1: 3, y1: 3 }
    const b = buffer(4, 4)
    new Stroke(b, RED_B, { bounds, mirror: { x: false, y: true } }).add({ x: 1, y: 2 })
    expect(render(b, RED_B)).toEqual(['....', '....', '.#..', '.#..'])
    const w = buffer(4, 4)
    const wrapped = new Stroke(w, RED_B, { bounds, wrap: true })
    wrapped.add({ x: 0, y: 3 })
    wrapped.add({ x: 0, y: 4 })
    expect(getPixel(w, 0, 2)).toEqual(RED_B)
    expect(getPixel(w, 0, 0)).toEqual(TRANSPARENT)
  })

  it('does not let fills leak into other frames', () => {
    const b = buffer(2, 4)
    const bounds = { x0: 0, y0: 0, x1: 1, y1: 1 }
    fill(b, 0, 0, RED_B, 'contiguous', null, false, bounds)
    expect(render(b, RED_B)).toEqual(['##', '##', '..', '..'])
    const g = buffer(2, 4)
    fill(g, 0, 3, RED_B, 'global', null, false, { x0: 0, y0: 2, x1: 1, y1: 3 })
    expect(render(g, RED_B)).toEqual(['..', '..', '##', '##'])
  })
})
