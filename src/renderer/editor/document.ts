// The image being edited: a stack of layers and their composite (what the user sees and what is
// saved). Pure: buffers are plain objects so it runs in tests; the editor wraps them in ImageData.
//
// Structural operations apply immediately and return a Command for the undo history.

import type { Command } from './history'
import type { PixelBuffer } from './pixels'
import { applyFrameOp, frameBounds, type FrameOp } from './frames'
import { stampFloating, type Bounds, type Floating, type Selection } from './selection'
import { tr } from '../../shared/i18n'

/** Pixels lifted out of a layer (moving/pasting), shown above it until dropped. */
export interface FloatingState {
  layerId: number
  piece: Floating
  /** The layer's pixels before the lift: dropping records one step against them. */
  snapshot: Uint8ClampedArray
  /** Selection before the lift, restored if the move is cancelled. */
  selectionBefore: Selection | null
}

export interface Layer {
  id: number
  name: string
  pixels: PixelBuffer
  visible: boolean
  /** 0–1, multiplied with each pixel's alpha. */
  opacity: number
}

export const MAX_LAYERS = 32

export class EditorDocument {
  /** Bottom layer first. */
  layers: Layer[]
  activeId: number
  composite: PixelBuffer
  /** Editable area: the whole image, or the animation frame being edited. */
  view: Bounds
  /** Current selection (not part of the undo history, like in most paint programs). */
  selection: Selection | null = null
  floating: FloatingState | null = null
  private nextId = 1

  constructor(
    readonly width: number,
    public height: number,
    data?: Uint8Array | Uint8ClampedArray
  ) {
    this.view = { x0: 0, y0: 0, x1: width - 1, y1: height - 1 }
    const first = this.createLayer(tr('Livello 1'))
    if (data) first.pixels.data.set(data)
    this.layers = [first]
    this.activeId = first.id
    this.composite = blank(width, height)
    this.recomposite()
  }

  get active(): Layer {
    return this.layers.find((layer) => layer.id === this.activeId) ?? this.layers.at(-1)!
  }

  indexOf(id: number): number {
    return this.layers.findIndex((layer) => layer.id === id)
  }

  /**
   * Straight-alpha "normal" blending of the visible layers, bottom to top. A single fully opaque
   * layer composites to an exact copy, so unlayered textures save byte-for-byte.
   */
  recomposite(): void {
    const out = this.composite.data
    out.fill(0)
    for (const layer of this.layers) {
      if (!layer.visible || layer.opacity <= 0) continue
      let src = layer.pixels.data
      if (this.floating?.layerId === layer.id) {
        // The floating piece is shown as part of its layer.
        const withPiece = { ...layer.pixels, data: new Uint8ClampedArray(src) }
        stampFloating(withPiece, this.floating.piece, this.view)
        src = withPiece.data
      }
      for (let i = 0; i < out.length; i += 4) {
        const sa = (src[i + 3]! / 255) * layer.opacity
        if (sa === 0) continue
        const da = out[i + 3]! / 255
        const oa = sa + da * (1 - sa)
        for (let c = 0; c < 3; c++) {
          out[i + c] = Math.round((src[i + c]! * sa + out[i + c]! * da * (1 - sa)) / oa)
        }
        out[i + 3] = Math.round(oa * 255)
      }
    }
  }

  // --- structural commands (applied now, undoable) ---------------------------------------------

  /** New empty layer above the active one, made active. Null when the layer limit is reached. */
  addLayer(): Command | null {
    if (this.layers.length >= MAX_LAYERS) return null
    const layer = this.createLayer(tr('Livello {0}', this.nextId))
    return this.insert(layer, this.indexOf(this.active.id) + 1)
  }

  duplicateLayer(id: number): Command | null {
    const source = this.layers[this.indexOf(id)]
    if (!source || this.layers.length >= MAX_LAYERS) return null
    const copy = this.createLayer(tr('{0} copia', source.name))
    copy.pixels.data.set(source.pixels.data)
    copy.visible = source.visible
    copy.opacity = source.opacity
    return this.insert(copy, this.indexOf(id) + 1)
  }

  /** Removes a layer (never the last one). */
  removeLayer(id: number): Command | null {
    const index = this.indexOf(id)
    if (index === -1 || this.layers.length === 1) return null
    const layer = this.layers[index]!
    const previousActive = this.activeId
    const remove = (): void => {
      this.layers.splice(index, 1)
      if (this.activeId === id) this.activeId = this.layers[Math.max(0, index - 1)]!.id
      this.recomposite()
    }
    remove()
    return {
      undo: () => {
        this.layers.splice(index, 0, layer)
        this.activeId = previousActive
        this.recomposite()
      },
      redo: remove
    }
  }

  /** Moves a layer up (+1, toward the top) or down (-1). */
  moveLayer(id: number, direction: 1 | -1): Command | null {
    const from = this.indexOf(id)
    const to = from + direction
    if (from === -1 || to < 0 || to >= this.layers.length) return null
    const swap = (a: number, b: number): void => {
      const layers = this.layers
      ;[layers[a], layers[b]] = [layers[b]!, layers[a]!]
      this.recomposite()
    }
    swap(from, to)
    return { undo: () => swap(to, from), redo: () => swap(from, to) }
  }

  setVisible(id: number, visible: boolean): Command | null {
    return this.setProperty(id, 'visible', visible)
  }

  /** Slider values pushed one after another merge into one undo step (see History). */
  setOpacity(id: number, opacity: number, from?: number): Command | null {
    const value = Math.min(1, Math.max(0, opacity))
    const command = this.setProperty(id, 'opacity', value, from)
    return command && { ...command, mergeKey: `opacity:${id}` }
  }

  rename(id: number, name: string): Command | null {
    const trimmed = name.trim().slice(0, 40)
    return trimmed ? this.setProperty(id, 'name', trimmed) : null
  }

  /**
   * Merges a layer into the one below it, as the two look now: each with its own opacity and
   * visibility baked in, the result at full opacity (the image and the saved PNG don't change).
   */
  mergeDown(id: number): Command | null {
    const index = this.indexOf(id)
    if (index <= 0) return null
    const upper = this.layers[index]!
    const lower = this.layers[index - 1]!
    const before = {
      data: new Uint8ClampedArray(lower.pixels.data),
      opacity: lower.opacity,
      visible: lower.visible
    }
    const previousActive = this.activeId
    // Both hidden: the merged layer stays hidden, with what showing both would give.
    const visible = lower.visible || upper.visible
    // Composite the two layers alone into the lower one.
    const pair = new EditorDocument(this.width, this.height)
    pair.layers = [
      { ...lower, visible: lower.visible || !visible },
      { ...upper, visible: upper.visible || !visible }
    ]
    pair.recomposite()
    const after = new Uint8ClampedArray(pair.composite.data)
    const merge = (): void => {
      lower.pixels.data.set(after)
      lower.opacity = 1
      lower.visible = visible
      this.layers.splice(this.indexOf(upper.id), 1)
      this.activeId = lower.id
      this.recomposite()
    }
    merge()
    return {
      undo: () => {
        lower.pixels.data.set(before.data)
        lower.opacity = before.opacity
        lower.visible = before.visible
        this.layers.splice(this.indexOf(lower.id) + 1, 0, upper)
        this.activeId = previousActive
        this.recomposite()
      },
      redo: merge
    }
  }

  // --- animation frames (vertical strip of `frameHeight`-tall frames) -------------------------

  /** Edits only frame `index` (null = the whole image). Not an undo step. */
  setFrameView(frameHeight: number | null, index = 0): void {
    this.view =
      frameHeight === null
        ? { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 }
        : frameBounds(this.width, frameHeight, index)
    this.selection = null
  }

  /**
   * Adds, removes (callers keep at least one) or moves a frame in every layer. `empty`: the texel
   * of a new empty frame. Null when the op does not apply.
   */
  frameOp(frameHeight: number, op: FrameOp, empty?: readonly number[]): Command | null {
    if (op.kind === 'move') {
      const other = op.index + op.direction
      if (other < 0 || other >= this.height / frameHeight) return null
    }
    return this.restructure((data) => applyFrameOp(data, this.width, frameHeight, op, empty)!)
  }

  /** New frame at `at`: a copy of frame `copyFrom`, or empty. */
  insertFrame(frameHeight: number, at: number, copyFrom: number | null): Command {
    return this.frameOp(frameHeight, { kind: 'insert', at, copyFrom })!
  }

  /** Removes frame `index` (callers keep at least one). */
  removeFrame(frameHeight: number, index: number): Command {
    return this.frameOp(frameHeight, { kind: 'remove', index })!
  }

  /** Swaps frame `index` with its neighbor (-1 = earlier, +1 = later). */
  moveFrame(frameHeight: number, index: number, direction: 1 | -1): Command | null {
    return this.frameOp(frameHeight, { kind: 'move', index, direction })
  }

  /**
   * Replaces every layer's pixels with `change(data)` (whole rows added/removed, same width). The
   * buffers are updated IN PLACE so earlier pixel commands keep pointing at them; the history is
   * linear, so they are only replayed once this command has been undone.
   */
  private restructure(change: (data: Uint8ClampedArray) => Uint8ClampedArray): Command {
    const before = this.layers.map((layer) => ({ layer, data: layer.pixels.data }))
    const after = before.map(({ layer, data }) => ({ layer, data: change(data) }))
    const heightBefore = this.height
    const heightAfter = after[0]!.data.length / (this.width * 4)
    const apply = (states: typeof before, height: number): void => {
      for (const { layer, data } of states) {
        const pixels = layer.pixels as { height: number; data: Uint8ClampedArray }
        pixels.height = height
        pixels.data = data
      }
      this.height = height
      this.composite = blank(this.width, height)
      this.selection = null
      this.floating = null
      this.view = {
        x0: 0,
        y0: Math.min(this.view.y0, height - 1),
        x1: this.width - 1,
        y1: Math.min(this.view.y1, height - 1)
      }
      this.recomposite()
    }
    apply(after, heightAfter)
    return { undo: () => apply(before, heightBefore), redo: () => apply(after, heightAfter) }
  }

  /** Makes a layer active (not an undo step: like selecting a tool). */
  setActive(id: number): void {
    if (this.indexOf(id) !== -1) this.activeId = id
  }

  private createLayer(name: string): Layer {
    return {
      id: this.nextId++,
      name,
      pixels: blank(this.width, this.height),
      visible: true,
      opacity: 1
    }
  }

  private insert(layer: Layer, index: number): Command {
    const previousActive = this.activeId
    const add = (): void => {
      this.layers.splice(index, 0, layer)
      this.activeId = layer.id
      this.recomposite()
    }
    add()
    return {
      undo: () => {
        this.layers.splice(this.indexOf(layer.id), 1)
        this.activeId = previousActive
        this.recomposite()
      },
      redo: add
    }
  }

  private setProperty<K extends 'visible' | 'opacity' | 'name'>(
    id: number,
    key: K,
    value: Layer[K],
    from?: Layer[K]
  ): Command | null {
    const layer = this.layers[this.indexOf(id)]
    if (!layer) return null
    const before = from ?? layer[key]
    if (before === value) {
      layer[key] = value
      return null
    }
    const set = (v: Layer[K]): void => {
      layer[key] = v
      this.recomposite()
    }
    set(value)
    return { undo: () => set(before), redo: () => set(value) }
  }
}

export function blank(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}
