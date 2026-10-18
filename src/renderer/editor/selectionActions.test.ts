import { describe, expect, it } from 'vitest'
import { EditorDocument } from './document'
import { History } from './history'
import { getPixel, setPixel, TRANSPARENT, type Rgba } from './pixels'
import { rectSelection } from './selection'
import {
  cancel,
  copy,
  cut,
  deselect,
  drop,
  erase,
  lift,
  moveBy,
  paste,
  selectAll,
  transform
} from './selectionActions'

const RED: Rgba = [255, 0, 0, 255]
const GRAY: Rgba = [100, 100, 100, 255]

/** 4×1 gray document with a red pixel at x = 0. */
function doc(): EditorDocument {
  const d = new EditorDocument(4, 1, Uint8Array.from([...RED, ...GRAY, ...GRAY, ...GRAY]))
  d.selection = rectSelection(4, 1, { x: 0, y: 0 }, { x: 0, y: 0 })
  return d
}

describe('lift / move / drop', () => {
  it('moves the selected pixels and records ONE undo step', () => {
    const d = doc()
    const history = new History()
    lift(d)
    moveBy(d, 2, 0)
    // While floating, the composite already shows the move.
    expect(getPixel(d.composite, 2, 0)).toEqual(RED)
    expect(getPixel(d.composite, 0, 0)).toEqual(TRANSPARENT)
    history.push(drop(d))
    expect(d.floating).toBeNull()
    expect(getPixel(d.active.pixels, 2, 0)).toEqual(RED)
    expect(d.selection?.bounds).toEqual({ x0: 2, y0: 0, x1: 2, y1: 0 })
    history.undo()
    expect(getPixel(d.active.pixels, 0, 0)).toEqual(RED)
    expect(getPixel(d.active.pixels, 2, 0)).toEqual(GRAY)
  })

  it('cancel puts everything back', () => {
    const d = doc()
    lift(d)
    moveBy(d, 1, 0)
    cancel(d)
    expect(getPixel(d.active.pixels, 0, 0)).toEqual(RED)
    expect(getPixel(d.active.pixels, 1, 0)).toEqual(GRAY)
    expect(d.selection?.bounds.x0).toBe(0)
  })

  it('without a selection, moves the whole layer', () => {
    const d = doc()
    d.selection = null
    lift(d)
    moveBy(d, 1, 0)
    drop(d)
    expect(getPixel(d.active.pixels, 1, 0)).toEqual(RED)
    // Pixels moved off the texture are dropped; the uncovered column is transparent.
    expect(getPixel(d.active.pixels, 0, 0)).toEqual(TRANSPARENT)
  })
})

describe('copy / cut / paste / erase', () => {
  it('copies and pastes as a floating piece', () => {
    const d = doc()
    const piece = copy(d)!
    deselect(d)
    paste(d, { ...piece, x: 3 })
    drop(d)
    expect(getPixel(d.active.pixels, 3, 0)).toEqual(RED)
    expect(getPixel(d.active.pixels, 0, 0)).toEqual(RED)
  })

  it('pastes at the top-left when the piece would not fit', () => {
    const d = doc()
    const piece = copy(d)!
    setPixel(d.active.pixels, 0, 0, GRAY)
    paste(d, { ...piece, x: 9 })
    drop(d)
    expect(getPixel(d.active.pixels, 0, 0)).toEqual(RED)
  })

  it('cut clears the selection, erase too, both undoable', () => {
    const d = doc()
    const history = new History()
    const { piece, command } = cut(d)
    history.push(command)
    expect(piece).not.toBeNull()
    expect(getPixel(d.active.pixels, 0, 0)).toEqual(TRANSPARENT)
    history.undo()
    expect(getPixel(d.active.pixels, 0, 0)).toEqual(RED)
    history.push(erase(d))
    expect(getPixel(d.active.pixels, 0, 0)).toEqual(TRANSPARENT)
  })

  it('erase while floating throws the piece away', () => {
    const d = doc()
    lift(d)
    moveBy(d, 2, 0)
    erase(d)
    expect(d.floating).toBeNull()
    expect(getPixel(d.active.pixels, 0, 0)).toEqual(TRANSPARENT)
    expect(getPixel(d.active.pixels, 2, 0)).toEqual(GRAY)
  })
})

describe('transform and select all', () => {
  it('flips the whole layer when nothing is selected', () => {
    const d = doc()
    d.selection = null
    transform(d, 'flipH')
    drop(d)
    expect(getPixel(d.active.pixels, 3, 0)).toEqual(RED)
  })

  it('select all drops a floating piece first', () => {
    const d = doc()
    lift(d)
    moveBy(d, 1, 0)
    expect(selectAll(d)).not.toBeNull()
    expect(d.floating).toBeNull()
    expect(d.selection?.bounds).toEqual({ x0: 0, y0: 0, x1: 3, y1: 0 })
  })
})
