// Undo/redo for the pixel editor. Each edit stores only the pixels it changed (before/after),
// so hundreds of steps cost little memory even on 64× textures.

import { setPixel, type PixelBuffer, type PixelChange } from './pixels'

export type Edit = readonly PixelChange[]

export const HISTORY_LIMIT = 200

export class History {
  private readonly edits: Edit[] = []
  /** Number of edits currently applied (edits after it can be redone). */
  private position = 0
  /** Position matching the file on disk; null once that state can no longer be reached. */
  private savedPosition: number | null = 0
  private changeCount = 0

  constructor(private readonly limit = HISTORY_LIMIT) {}

  /** Records an edit that was already applied to the buffer. Discards the redo steps. */
  push(edit: Edit): void {
    if (edit.length === 0) return
    this.edits.splice(this.position)
    if (this.savedPosition !== null && this.savedPosition > this.position) this.savedPosition = null
    this.edits.push(edit)
    this.position++
    this.changeCount++
    if (this.edits.length > this.limit) {
      this.edits.shift()
      this.position--
      if (this.savedPosition !== null) {
        this.savedPosition = this.savedPosition > 0 ? this.savedPosition - 1 : null
      }
    }
  }

  undo(buffer: PixelBuffer): boolean {
    if (!this.canUndo) return false
    this.position--
    this.changeCount++
    apply(buffer, this.edits[this.position]!, 'before')
    return true
  }

  redo(buffer: PixelBuffer): boolean {
    if (!this.canRedo) return false
    apply(buffer, this.edits[this.position]!, 'after')
    this.position++
    this.changeCount++
    return true
  }

  get canUndo(): boolean {
    return this.position > 0
  }

  get canRedo(): boolean {
    return this.position < this.edits.length
  }

  /** True when the buffer differs from the last saved (or loaded) state. */
  get modified(): boolean {
    return this.savedPosition !== this.position
  }

  /** Bumped by every push/undo/redo: tells whether the image changed during an async save. */
  get version(): number {
    return this.changeCount
  }

  markSaved(): void {
    this.savedPosition = this.position
  }
}

function apply(buffer: PixelBuffer, edit: Edit, side: 'before' | 'after'): void {
  for (const change of edit) {
    setPixel(
      buffer,
      change.index % buffer.width,
      Math.floor(change.index / buffer.width),
      change[side]
    )
  }
}
