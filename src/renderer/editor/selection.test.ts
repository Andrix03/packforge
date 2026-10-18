import { describe, expect, it } from 'vitest'
import { getPixel, setPixel, TRANSPARENT, type PixelBuffer, type Rgba } from './pixels'
import {
  allSelection,
  clearSelected,
  extract,
  flipFloating,
  floatingSelection,
  isSelected,
  maskSelection,
  moveFloating,
  outlineSegments,
  rectSelection,
  rotateFloating,
  stampFloating
} from './selection'

const RED: Rgba = [255, 0, 0, 255]
const BLUE: Rgba = [0, 0, 255, 255]
const GRAY: Rgba = [100, 100, 100, 255]

function buffer(width: number, height: number, fill: Rgba = GRAY): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) data.set(fill, i * 4)
  return { width, height, data }
}

describe('rectSelection', () => {
  it('selects the rectangle between two points in any order, clamped to the texture', () => {
    const selection = rectSelection(4, 4, { x: 5, y: 2 }, { x: 2, y: -3 })!
    expect(selection.bounds).toEqual({ x0: 2, y0: 0, x1: 3, y1: 2 })
    expect(isSelected(selection, 2, 0)).toBe(true)
    expect(isSelected(selection, 1, 0)).toBe(false)
    expect(isSelected(selection, 3, 3)).toBe(false)
  })

  it('returns null when the rectangle misses the texture', () => {
    expect(rectSelection(4, 4, { x: 5, y: 5 }, { x: 9, y: 9 })).toBeNull()
  })
})

describe('maskSelection', () => {
  it('computes the bounds of arbitrary pixels', () => {
    const selection = maskSelection(4, 4, [5, 10])!
    expect(selection.bounds).toEqual({ x0: 1, y0: 1, x1: 2, y1: 2 })
    expect(maskSelection(4, 4, [])).toBeNull()
  })
})

describe('extract / clear / stamp', () => {
  it('lifts the selected pixels and drops them elsewhere, replacing what is below', () => {
    const b = buffer(4, 1)
    setPixel(b, 0, 0, RED)
    setPixel(b, 1, 0, BLUE)
    const selection = rectSelection(4, 1, { x: 0, y: 0 }, { x: 1, y: 0 })!
    const piece = extract(b, selection)
    expect(clearSelected(b, selection)).toHaveLength(2)
    expect(getPixel(b, 0, 0)).toEqual(TRANSPARENT)
    stampFloating(b, moveFloating(piece, 2, 0))
    expect(getPixel(b, 2, 0)).toEqual(RED)
    expect(getPixel(b, 3, 0)).toEqual(BLUE)
  })

  it('keeps only the selection shape and skips transparent and off-texture pixels', () => {
    const b = buffer(3, 1)
    setPixel(b, 0, 0, RED)
    const selection = maskSelection(3, 1, [0])!
    const piece = extract(b, selection)
    const target = buffer(3, 1, BLUE)
    stampFloating(target, moveFloating(piece, -1, 0))
    expect(getPixel(target, 0, 0)).toEqual(BLUE)
    const clear = buffer(1, 1, TRANSPARENT)
    const empty = extract(clear, allSelection(1, 1))
    stampFloating(target, empty)
    expect(getPixel(target, 0, 0)).toEqual(BLUE)
  })

  it('selection follows the moved piece', () => {
    const b = buffer(4, 4)
    const piece = extract(b, rectSelection(4, 4, { x: 0, y: 0 }, { x: 1, y: 1 })!)
    const moved = floatingSelection(moveFloating(piece, 3, 3), 4, 4)!
    expect(moved.bounds).toEqual({ x0: 3, y0: 3, x1: 3, y1: 3 })
  })
})

describe('flip / rotate', () => {
  // 3×2 piece: R B . / . . G
  function piece() {
    const b = buffer(3, 2, TRANSPARENT)
    setPixel(b, 0, 0, RED)
    setPixel(b, 1, 0, BLUE)
    setPixel(b, 2, 1, GRAY)
    return extract(b, allSelection(3, 2))
  }
  const at = (f: ReturnType<typeof piece>, x: number, y: number): Rgba =>
    getPixel({ width: f.width, height: f.height, data: f.data }, x, y)

  it('flips horizontally and vertically', () => {
    const h = flipFloating(piece(), 'h')
    expect(at(h, 2, 0)).toEqual(RED)
    expect(at(h, 0, 1)).toEqual(GRAY)
    const v = flipFloating(piece(), 'v')
    expect(at(v, 0, 1)).toEqual(RED)
    expect(at(v, 2, 0)).toEqual(GRAY)
  })

  it('rotates 90° clockwise, swapping width and height', () => {
    const r = rotateFloating(piece())
    expect([r.width, r.height]).toEqual([2, 3])
    // Top-left red goes to the top-right; bottom-right gray to the bottom-left.
    expect(at(r, 1, 0)).toEqual(RED)
    expect(at(r, 1, 1)).toEqual(BLUE)
    expect(at(r, 0, 2)).toEqual(GRAY)
  })

  it('four rotations give back the original piece', () => {
    const original = piece()
    const r = rotateFloating(rotateFloating(rotateFloating(rotateFloating(original))))
    expect([...r.data]).toEqual([...original.data])
    expect([r.x, r.y]).toEqual([original.x, original.y])
  })
})

describe('outlineSegments', () => {
  it('outlines a single pixel with 4 edges and a 2×1 block with 6', () => {
    expect(outlineSegments(Uint8Array.from([1]), 1, 1)).toHaveLength(4)
    expect(outlineSegments(Uint8Array.from([1, 1]), 2, 1)).toHaveLength(6)
  })
})
