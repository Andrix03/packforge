import { describe, expect, it } from 'vitest'
import { History } from './history'
import { getPixel, Stroke, type PixelBuffer, type Rgba } from './pixels'

const RED: Rgba = [255, 0, 0, 255]
const BLUE: Rgba = [0, 0, 255, 255]
const GRAY: Rgba = [100, 100, 100, 255]

function buffer(width: number, fill: Rgba = GRAY): PixelBuffer {
  const data = new Uint8ClampedArray(width * 4)
  for (let i = 0; i < width; i++) data.set(fill, i * 4)
  return { width, height: 1, data }
}

/** Paints pixel x with `color` as one stroke and records it. */
function paint(history: History, b: PixelBuffer, x: number, color: Rgba): void {
  const stroke = new Stroke(b, color, false)
  stroke.add({ x, y: 0 })
  history.push(stroke.changes())
}

describe('History', () => {
  it('undoes and redoes strokes in order', () => {
    const b = buffer(2)
    const history = new History()
    paint(history, b, 0, RED)
    paint(history, b, 0, BLUE)
    expect(history.undo(b)).toBe(true)
    expect(getPixel(b, 0, 0)).toEqual(RED)
    expect(history.undo(b)).toBe(true)
    expect(getPixel(b, 0, 0)).toEqual(GRAY)
    expect(history.undo(b)).toBe(false)
    expect(history.redo(b)).toBe(true)
    expect(history.redo(b)).toBe(true)
    expect(getPixel(b, 0, 0)).toEqual(BLUE)
    expect(history.redo(b)).toBe(false)
  })

  it('drops the redo steps when a new stroke is made', () => {
    const b = buffer(2)
    const history = new History()
    paint(history, b, 0, RED)
    history.undo(b)
    paint(history, b, 1, BLUE)
    expect(history.canRedo).toBe(false)
    history.undo(b)
    expect(getPixel(b, 0, 0)).toEqual(GRAY)
    expect(getPixel(b, 1, 0)).toEqual(GRAY)
  })

  it('ignores strokes that changed nothing', () => {
    const b = buffer(1)
    const history = new History()
    paint(history, b, 0, GRAY)
    expect(history.canUndo).toBe(false)
    expect(history.modified).toBe(false)
  })

  it('knows when the image is back to the saved state', () => {
    const b = buffer(1)
    const history = new History()
    expect(history.modified).toBe(false)
    paint(history, b, 0, RED)
    expect(history.modified).toBe(true)
    history.undo(b)
    expect(history.modified).toBe(false)
    history.redo(b)
    history.markSaved()
    expect(history.modified).toBe(false)
    history.undo(b)
    expect(history.modified).toBe(true)
  })

  it('stays modified when the saved state was in a discarded redo branch', () => {
    const b = buffer(2)
    const history = new History()
    paint(history, b, 0, RED)
    history.markSaved()
    history.undo(b)
    paint(history, b, 1, BLUE)
    history.undo(b)
    // Same pixels as before the save? No: the saved state had pixel 0 red.
    expect(history.modified).toBe(true)
  })

  it('keeps at most `limit` steps, dropping the oldest', () => {
    const b = buffer(1)
    const history = new History(3)
    for (const color of [RED, BLUE, RED, BLUE] as const) paint(history, b, 0, color)
    let undone = 0
    while (history.undo(b)) undone++
    expect(undone).toBe(3)
    // The first stroke (gray → red) can no longer be undone.
    expect(getPixel(b, 0, 0)).toEqual(RED)
    // The loaded state is gone from the history, so the image counts as modified.
    expect(history.modified).toBe(true)
  })
})
