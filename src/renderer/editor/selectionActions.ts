// Selection operations on the document: lift/move/drop, copy/cut/paste, flip/rotate, delete.
// Pure (no React). Functions that change layer pixels return the Command to record; lifting and
// moving don't (the whole move becomes ONE step when the piece is dropped).

import type { EditorDocument } from './document'
import { pixelCommand, type Command } from './history'
import { diffPixels } from './pixels'
import {
  allSelection,
  clearSelected,
  extract,
  flipFloating,
  floatingSelection,
  moveFloating,
  rotateFloating,
  stampFloating,
  type Floating
} from './selection'

/** Lifts the selected pixels of the active layer (everything if nothing is selected). */
export function lift(doc: EditorDocument): void {
  if (doc.floating) return
  const layer = doc.active
  const selection = doc.selection ?? allSelection(doc.width, doc.height)
  const snapshot = new Uint8ClampedArray(layer.pixels.data)
  const piece = extract(layer.pixels, selection)
  clearSelected(layer.pixels, selection)
  doc.floating = { layerId: layer.id, piece, snapshot, selectionBefore: doc.selection }
  doc.selection = floatingSelection(piece, doc.width, doc.height)
  doc.recomposite()
}

export function moveBy(doc: EditorDocument, dx: number, dy: number): void {
  if (!doc.floating || (dx === 0 && dy === 0)) return
  setPiece(doc, moveFloating(doc.floating.piece, dx, dy))
}

/** Flips or rotates the floating piece, lifting the selection (or the whole layer) first. */
export function transform(doc: EditorDocument, kind: 'flipH' | 'flipV' | 'rotate'): void {
  lift(doc)
  const piece = doc.floating!.piece
  setPiece(
    doc,
    kind === 'rotate' ? rotateFloating(piece) : flipFloating(piece, kind === 'flipH' ? 'h' : 'v')
  )
}

/** Puts the floating piece down into its layer: one undo step for lift + move + drop. */
export function drop(doc: EditorDocument): Command | null {
  const floating = doc.floating
  if (!floating) return null
  doc.floating = null
  const layer = doc.layers[doc.indexOf(floating.layerId)]
  if (!layer) {
    doc.recomposite()
    return null
  }
  stampFloating(layer.pixels, floating.piece)
  doc.recomposite()
  return pixelCommand(layer.pixels, diffPixels(layer.pixels, floating.snapshot))
}

/** Puts the lifted pixels back where they were (Esc, Ctrl+Z while moving). */
export function cancel(doc: EditorDocument): void {
  const floating = doc.floating
  if (!floating) return
  const layer = doc.layers[doc.indexOf(floating.layerId)]
  if (layer) layer.pixels.data.set(floating.snapshot)
  doc.floating = null
  doc.selection = floating.selectionBefore
  doc.recomposite()
}

/** Deselects, dropping a floating piece first. */
export function deselect(doc: EditorDocument): Command | null {
  const command = drop(doc)
  doc.selection = null
  doc.recomposite()
  return command
}

export function selectAll(doc: EditorDocument): Command | null {
  const command = drop(doc)
  doc.selection = allSelection(doc.width, doc.height)
  return command
}

/** Copy of the selected pixels of the active layer (or of the floating piece). */
export function copy(doc: EditorDocument): Floating | null {
  if (doc.floating) return doc.floating.piece
  if (!doc.selection) return null
  return extract(doc.active.pixels, doc.selection)
}

/** Makes the selected pixels transparent; a floating piece is simply thrown away. */
export function erase(doc: EditorDocument): Command | null {
  if (doc.floating) {
    const floating = doc.floating
    doc.floating = null
    doc.recomposite()
    const layer = doc.layers[doc.indexOf(floating.layerId)]
    return layer ? pixelCommand(layer.pixels, diffPixels(layer.pixels, floating.snapshot)) : null
  }
  if (!doc.selection) return null
  const command = pixelCommand(doc.active.pixels, clearSelected(doc.active.pixels, doc.selection))
  doc.recomposite()
  return command
}

/** Copy + erase. Returns the copied piece and the command to record. */
export function cut(doc: EditorDocument): { piece: Floating | null; command: Command | null } {
  const piece = copy(doc)
  return { piece, command: piece ? erase(doc) : null }
}

/**
 * Pastes a piece as floating content on the active layer, at its original position when it fits,
 * else at the top-left corner. Drops any current floating piece first (returned command).
 */
export function paste(doc: EditorDocument, piece: Floating): Command | null {
  const command = drop(doc)
  const fits =
    piece.x >= 0 &&
    piece.y >= 0 &&
    piece.x + piece.width <= doc.width &&
    piece.y + piece.height <= doc.height
  const placed = fits ? piece : { ...piece, x: 0, y: 0 }
  const layer = doc.active
  doc.floating = {
    layerId: layer.id,
    piece: placed,
    snapshot: new Uint8ClampedArray(layer.pixels.data),
    selectionBefore: doc.selection
  }
  doc.selection = floatingSelection(placed, doc.width, doc.height)
  doc.recomposite()
  return command
}

function setPiece(doc: EditorDocument, piece: Floating): void {
  doc.floating = { ...doc.floating!, piece }
  doc.selection = floatingSelection(piece, doc.width, doc.height)
  doc.recomposite()
}

/** Drops the selection without touching pixels (Esc with nothing floating). */
export function clearSelection(doc: EditorDocument): void {
  doc.selection = null
}
