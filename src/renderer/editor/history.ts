// Undo/redo for the pixel editor, as a list of commands. A command is applied when it is created;
// the history only replays it backward (undo) and forward (redo). Pixel edits store only the
// pixels they changed (before/after), so hundreds of steps cost little memory even on 64× textures.

import { setPixel, type PixelBuffer, type PixelChange } from './pixels'

export interface Command {
  undo(): void
  redo(): void
  /**
   * Consecutive commands with the same key, pushed within MERGE_WINDOW_MS of each other, become
   * ONE undo step (e.g. every value of an opacity slider drag).
   */
  mergeKey?: string
}

export const MERGE_WINDOW_MS = 1500

export const HISTORY_LIMIT = 200

export class History {
  private readonly commands: Command[] = []
  /** Number of commands currently applied (those after it can be redone). */
  private position = 0
  /** Position matching the file on disk; null once that state can no longer be reached. */
  private savedPosition: number | null = 0
  private changeCount = 0
  private lastPush = { key: undefined as string | undefined, at: 0 }

  constructor(
    private readonly limit = HISTORY_LIMIT,
    private readonly now: () => number = () => Date.now()
  ) {}

  /** Records a command that was already applied. Discards the redo steps. Null is ignored. */
  push(command: Command | null): void {
    if (!command) return
    const time = this.now()
    const previous = this.commands[this.position - 1]
    const mergeable =
      command.mergeKey !== undefined &&
      previous !== undefined &&
      this.position === this.commands.length &&
      this.lastPush.key === command.mergeKey &&
      time - this.lastPush.at <= MERGE_WINDOW_MS &&
      // Never merge across the saved point: "modified" must stay exact.
      this.savedPosition !== this.position
    this.lastPush = { key: command.mergeKey, at: time }
    if (mergeable) {
      this.commands[this.position - 1] = {
        undo: () => {
          command.undo()
          previous.undo()
        },
        redo: () => {
          previous.redo()
          command.redo()
        },
        mergeKey: command.mergeKey!
      }
      this.changeCount++
      return
    }
    this.commands.splice(this.position)
    if (this.savedPosition !== null && this.savedPosition > this.position) this.savedPosition = null
    this.commands.push(command)
    this.position++
    this.changeCount++
    if (this.commands.length > this.limit) {
      this.commands.shift()
      this.position--
      if (this.savedPosition !== null) {
        this.savedPosition = this.savedPosition > 0 ? this.savedPosition - 1 : null
      }
    }
  }

  undo(): boolean {
    if (!this.canUndo) return false
    this.lastPush = { key: undefined, at: 0 }
    this.position--
    this.changeCount++
    this.commands[this.position]!.undo()
    return true
  }

  redo(): boolean {
    if (!this.canRedo) return false
    this.lastPush = { key: undefined, at: 0 }
    this.commands[this.position]!.redo()
    this.position++
    this.changeCount++
    return true
  }

  get canUndo(): boolean {
    return this.position > 0
  }

  get canRedo(): boolean {
    return this.position < this.commands.length
  }

  /** True when the document differs from the last saved (or loaded) state. */
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

  /** Forgets every step: the document was reloaded from disk (old steps point at old buffers). */
  reset(): void {
    this.commands.length = 0
    this.position = 0
    this.savedPosition = 0
    this.changeCount++
    this.lastPush = { key: undefined, at: 0 }
  }
}

/** Command for pixels already changed in `buffer`; null when nothing changed. */
export function pixelCommand(buffer: PixelBuffer, changes: readonly PixelChange[]): Command | null {
  if (changes.length === 0) return null
  const apply = (side: 'before' | 'after'): void => {
    for (const change of changes) {
      setPixel(
        buffer,
        change.index % buffer.width,
        Math.floor(change.index / buffer.width),
        change[side]
      )
    }
  }
  return { undo: () => apply('before'), redo: () => apply('after') }
}

/** Several commands as one undo step (e.g. a move = cut + paste). */
export function combine(commands: ReadonlyArray<Command | null>): Command | null {
  const list = commands.filter((c): c is Command => c !== null)
  if (list.length === 0) return null
  return {
    undo: () => {
      for (let i = list.length - 1; i >= 0; i--) list[i]!.undo()
    },
    redo: () => {
      for (const command of list) command.redo()
    }
  }
}
