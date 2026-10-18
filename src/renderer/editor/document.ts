// The image being edited: a stack of layers and their composite (what the user sees and what is
// saved). Pure: buffers are plain objects so it runs in tests; the editor wraps them in ImageData.
//
// Structural operations apply immediately and return a Command for the undo history.

import type { Command } from './history'
import type { PixelBuffer } from './pixels'

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
  readonly composite: PixelBuffer
  private nextId = 1

  constructor(
    readonly width: number,
    readonly height: number,
    data?: Uint8Array | Uint8ClampedArray
  ) {
    const first = this.createLayer('Livello 1')
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
      const src = layer.pixels.data
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
    const layer = this.createLayer(`Livello ${this.nextId}`)
    return this.insert(layer, this.indexOf(this.active.id) + 1)
  }

  duplicateLayer(id: number): Command | null {
    const source = this.layers[this.indexOf(id)]
    if (!source || this.layers.length >= MAX_LAYERS) return null
    const copy = this.createLayer(`${source.name} copia`)
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

  /** `from` is the opacity before a slider drag started (the drag applied values live). */
  setOpacity(id: number, opacity: number, from?: number): Command | null {
    const value = Math.min(1, Math.max(0, opacity))
    return this.setProperty(id, 'opacity', value, from)
  }

  rename(id: number, name: string): Command | null {
    const trimmed = name.trim().slice(0, 40)
    return trimmed ? this.setProperty(id, 'name', trimmed) : null
  }

  /** Merges a layer into the one below it (its opacity is baked in). */
  mergeDown(id: number): Command | null {
    const index = this.indexOf(id)
    if (index <= 0) return null
    const upper = this.layers[index]!
    const lower = this.layers[index - 1]!
    const before = new Uint8ClampedArray(lower.pixels.data)
    const previousActive = this.activeId
    // Composite the two layers alone (lower as-is, upper with its opacity) into the lower one.
    const pair = new EditorDocument(this.width, this.height)
    pair.layers = [
      { ...lower, visible: true, opacity: 1 },
      { ...upper, visible: upper.visible }
    ]
    pair.recomposite()
    const after = new Uint8ClampedArray(pair.composite.data)
    const merge = (): void => {
      lower.pixels.data.set(after)
      this.layers.splice(this.indexOf(upper.id), 1)
      this.activeId = lower.id
      this.recomposite()
    }
    merge()
    return {
      undo: () => {
        lower.pixels.data.set(before)
        this.layers.splice(this.indexOf(lower.id) + 1, 0, upper)
        this.activeId = previousActive
        this.recomposite()
      },
      redo: merge
    }
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
