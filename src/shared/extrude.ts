// "Extrude" (Phase 13 logic): a flat item/block texture turned into a thick 3D model made of
// cuboids, vanilla model JSON (no mods). Opaque pixels are merged into the largest rectangles
// (greedy), one element each: front and back show the rectangle, the sides show the edge pixels
// and only exist where the rectangle borders transparency. Pure.

import { VANILLA_MAX_FACES } from './modelRules'
import { tr } from './i18n'

export interface PixelRect {
  x: number
  y: number
  width: number
  height: number
}

/** Greedy rectangles covering the opaque pixels exactly (rows first, then grown downwards). */
export function opaqueRects(
  width: number,
  height: number,
  opaque: (x: number, y: number) => boolean
): PixelRect[] {
  const used = new Uint8Array(width * height)
  const free = (x: number, y: number): boolean => opaque(x, y) && used[y * width + x] === 0
  const rects: PixelRect[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!free(x, y)) continue
      let w = 1
      while (x + w < width && free(x + w, y)) w++
      let h = 1
      grow: while (y + h < height) {
        for (let i = 0; i < w; i++) if (!free(x + i, y + h)) break grow
        h++
      }
      for (let j = 0; j < h; j++) used.fill(1, (y + j) * width + x, (y + j) * width + x + w)
      rects.push({ x, y, width: w, height: h })
    }
  }
  return rects
}

export interface ExtrudeOptions {
  /** Thickness in model units (16 = one block); vanilla item sprites are 1. */
  thickness: number
  /** Most elements to write; more rectangles than this are refused (the model would be heavy). */
  budget: number
}

export const DEFAULT_EXTRUDE: ExtrudeOptions = { thickness: 1, budget: 120 }

export type ExtrudeResult =
  | { ok: true; model: Record<string, unknown>; elements: number; faces: number; heavy: boolean }
  | { ok: false; error: string }

// How vanilla `item/generated` shows a flat item (26.3 client data, values only).
const ITEM_DISPLAY = {
  ground: { rotation: [0, 0, 0], translation: [0, 2, 0], scale: [0.5, 0.5, 0.5] },
  head: { rotation: [0, 180, 0], translation: [0, 13, 7], scale: [1, 1, 1] },
  thirdperson_righthand: { rotation: [0, 0, 0], translation: [0, 3, 1], scale: [0.55, 0.55, 0.55] },
  firstperson_righthand: {
    rotation: [0, -90, 25],
    translation: [1.13, 3.2, 1.13],
    scale: [0.68, 0.68, 0.68]
  },
  fixed: { rotation: [0, 180, 0], scale: [1, 1, 1] }
}

/**
 * The model JSON of the extruded sprite (`texture`: its id, e.g. `minecraft:item/apple`).
 * Coordinates: the sprite fills 16 units on its longer side, centred, `thickness` deep around z 8.
 */
export function extrudeModel(
  width: number,
  height: number,
  opaque: (x: number, y: number) => boolean,
  texture: string,
  options: ExtrudeOptions = DEFAULT_EXTRUDE
): ExtrudeResult {
  const rects = opaqueRects(width, height, opaque)
  if (rects.length === 0) return { ok: false, error: tr('La texture è tutta trasparente.') }
  if (rects.length > options.budget) {
    return {
      ok: false,
      error: tr(
        'Servirebbero {0} elementi (massimo {1}): troppi colori sparsi o pixel isolati. Semplifica la sagoma o alza il limite.',
        rects.length,
        options.budget
      )
    }
  }
  const scale = 16 / Math.max(width, height)
  const offsetX = (16 - width * scale) / 2
  const offsetY = (16 - height * scale) / 2
  const z0 = round(8 - options.thickness / 2)
  const z1 = round(8 + options.thickness / 2)
  // UVs are in 0–16 units of the texture on each axis.
  const u = (px: number): number => round((px * 16) / width)
  const v = (px: number): number => round((px * 16) / height)
  const edge = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= width || y >= height || !opaque(x, y)

  let faces = 0
  const elements = rects.map((r) => {
    const x0 = round(offsetX + r.x * scale)
    const x1 = round(offsetX + (r.x + r.width) * scale)
    // Texture rows go down, model y goes up.
    const y0 = round(offsetY + (height - r.y - r.height) * scale)
    const y1 = round(offsetY + (height - r.y) * scale)
    const tex = '#texture'
    const out: Record<string, { uv: number[]; texture: string }> = {
      north: { uv: [u(r.x + r.width), v(r.y), u(r.x), v(r.y + r.height)], texture: tex },
      south: { uv: [u(r.x), v(r.y), u(r.x + r.width), v(r.y + r.height)], texture: tex }
    }
    const row = (y: number): boolean => {
      for (let i = r.x; i < r.x + r.width; i++) if (edge(i, y)) return true
      return false
    }
    const column = (x: number): boolean => {
      for (let j = r.y; j < r.y + r.height; j++) if (edge(x, j)) return true
      return false
    }
    // Sides sample a one-pixel strip along their edge.
    if (row(r.y - 1))
      out['up'] = { uv: [u(r.x), v(r.y), u(r.x + r.width), v(r.y + 1)], texture: tex }
    if (row(r.y + r.height)) {
      out['down'] = {
        uv: [u(r.x), v(r.y + r.height - 1), u(r.x + r.width), v(r.y + r.height)],
        texture: tex
      }
    }
    if (column(r.x - 1))
      out['west'] = { uv: [u(r.x), v(r.y), u(r.x + 1), v(r.y + r.height)], texture: tex }
    if (column(r.x + r.width)) {
      out['east'] = {
        uv: [u(r.x + r.width - 1), v(r.y), u(r.x + r.width), v(r.y + r.height)],
        texture: tex
      }
    }
    faces += Object.keys(out).length
    return { from: [x0, y0, z0], to: [x1, y1, z1], faces: out }
  })
  return {
    ok: true,
    model: {
      gui_light: 'front',
      textures: { texture, particle: texture },
      elements,
      display: ITEM_DISPLAY
    },
    elements: elements.length,
    faces,
    heavy: faces > VANILLA_MAX_FACES * 4
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
