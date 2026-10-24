// "Pixels that pop out" (Phase 13): a full-cube block (ores, gems in stone…) gets some of its
// texture's pixels raised as thin cuboids on every face, vanilla model JSON only. Chosen pixels are
// merged into the largest rectangles (shared/extrude.ts opaqueRects); each rectangle becomes one
// element per face: its outer face shows the rectangle (the default UV of a face already maps it
// back to the same pixels), its sides show the one-pixel strip along that edge and only exist where
// the rectangle borders pixels that don't pop. Every face of a raised piece is culled like the face
// it sits on, so buried ore shows only where the block is exposed. Pure.
import type { Direction, Vec3 } from './blockModel'
import { opaqueRects, type PixelRect } from './extrude'
import { tr } from './i18n'
import { VANILLA_MAX_FACES } from './modelRules'

export interface PopOutOptions {
  /** How far the pixels stand out, in texture pixels. */
  depth: number
  faces: readonly Direction[]
}

export const ALL_FACES: readonly Direction[] = ['north', 'south', 'east', 'west', 'up', 'down']

type Axis = 0 | 1 | 2
type Edge = 'left' | 'right' | 'top' | 'bottom'

/** Axis along each face's outward normal. */
const DEPTH_AXIS: Record<Direction, Axis> = {
  north: 2,
  south: 2,
  east: 0,
  west: 0,
  up: 1,
  down: 1
}
/** The axis a face's UV u runs along (its vertical is y, or z for up/down). */
const U_AXIS: Record<Direction, Axis> = {
  north: 0,
  south: 0,
  east: 2,
  west: 2,
  up: 0,
  down: 0
}

/** Which way a texture edge of a piece on `face` points in the world (default UV mapping). */
const EDGE_SIDE: Record<Direction, Record<Edge, Direction>> = {
  north: { right: 'west', left: 'east', bottom: 'down', top: 'up' },
  south: { right: 'east', left: 'west', bottom: 'down', top: 'up' },
  east: { right: 'north', left: 'south', bottom: 'down', top: 'up' },
  west: { right: 'south', left: 'north', bottom: 'down', top: 'up' },
  up: { right: 'east', left: 'west', bottom: 'south', top: 'north' },
  down: { right: 'east', left: 'west', bottom: 'north', top: 'south' }
}

/** The box of a rectangle (in 0–16 texture units) raised by `d` on `face` of the full cube. */
function pieceBox(
  face: Direction,
  [u1, v1, u2, v2]: [number, number, number, number],
  d: number
): { from: Vec3; to: Vec3 } {
  switch (face) {
    case 'north':
      return { from: [16 - u2, 16 - v2, -d], to: [16 - u1, 16 - v1, 0] }
    case 'south':
      return { from: [u1, 16 - v2, 16], to: [u2, 16 - v1, 16 + d] }
    case 'east':
      return { from: [16, 16 - v2, 16 - u2], to: [16 + d, 16 - v1, 16 - u1] }
    case 'west':
      return { from: [-d, 16 - v2, u1], to: [0, 16 - v1, u2] }
    case 'up':
      return { from: [u1, 16, v1], to: [u2, 16 + d, v2] }
    case 'down':
      return { from: [u1, -d, 16 - v2], to: [u2, 0, 16 - v1] }
  }
}

export type PopOutResult =
  | {
      ok: true
      model: Record<string, unknown>
      elements: number
      faces: number
      heavy: boolean
    }
  | { ok: false; error: string }

/**
 * The block model: the full cube with `texture` (a texture id) on every face, plus the raised
 * pixels. `selected(x, y)` tells which pixels of the `width`×`height` texture pop out.
 */
export function popOutModel(
  width: number,
  height: number,
  selected: (x: number, y: number) => boolean,
  texture: string,
  options: PopOutOptions
): PopOutResult {
  const rects = opaqueRects(width, height, selected)
  if (rects.length === 0) return { ok: false, error: tr('Scegli almeno un colore da sollevare.') }
  const round = (value: number): number => Math.round(value * 1000) / 1000
  const u = (px: number): number => round((px * 16) / width)
  const v = (px: number): number => round((px * 16) / height)
  const d = round((options.depth * 16) / Math.max(width, height))
  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && selected(x, y)
  // Does the edge of `r` border any pixel that doesn't pop (or the texture's border)?
  const open = (r: PixelRect, edge: Edge): boolean => {
    const cells: Array<[number, number]> = []
    if (edge === 'top' || edge === 'bottom') {
      const y = edge === 'top' ? r.y - 1 : r.y + r.height
      for (let x = r.x; x < r.x + r.width; x++) cells.push([x, y])
    } else {
      const x = edge === 'left' ? r.x - 1 : r.x + r.width
      for (let y = r.y; y < r.y + r.height; y++) cells.push([x, y])
    }
    return cells.some(([x, y]) => !inside(x, y))
  }
  // The one-pixel strip of `r` along an edge, as a face UV.
  const strip = (r: PixelRect, edge: Edge): [number, number, number, number] => {
    switch (edge) {
      case 'top':
        return [u(r.x), v(r.y), u(r.x + r.width), v(r.y + 1)]
      case 'bottom':
        return [u(r.x), v(r.y + r.height - 1), u(r.x + r.width), v(r.y + r.height)]
      case 'left':
        return [u(r.x), v(r.y), u(r.x + 1), v(r.y + r.height)]
      case 'right':
        return [u(r.x + r.width - 1), v(r.y), u(r.x + r.width), v(r.y + r.height)]
    }
  }

  const tex = '#all'
  const elements: Array<Record<string, unknown>> = [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: Object.fromEntries(
        (['down', 'up', 'north', 'south', 'west', 'east'] as const).map((dir) => [
          dir,
          { texture: tex, cullface: dir }
        ])
      )
    }
  ]
  let faces = 6
  for (const face of options.faces) {
    for (const r of rects) {
      const box = pieceBox(face, [u(r.x), v(r.y), u(r.x + r.width), v(r.y + r.height)], d)
      const out: Record<string, unknown> = { [face]: { texture: tex, cullface: face } }
      for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
        if (!open(r, edge)) continue
        const side = EDGE_SIDE[face][edge]
        // The strip runs along the edge; the side face is the edge × the depth. When the face's
        // u axis is the depth, a horizontal strip (top/bottom) must be turned to stand upright,
        // and the other way round. (The order of the strip's pixels may come out mirrored.)
        const horizontalStrip = edge === 'top' || edge === 'bottom'
        const uIsDepth = U_AXIS[side] === DEPTH_AXIS[face]
        const turn = horizontalStrip === uIsDepth
        out[side] = {
          uv: strip(r, edge),
          texture: tex,
          cullface: face,
          ...(turn ? { rotation: 90 } : {})
        }
      }
      faces += Object.keys(out).length
      elements.push({ from: box.from, to: box.to, faces: out })
    }
  }
  return {
    ok: true,
    model: {
      parent: 'minecraft:block/block',
      textures: { all: texture, particle: texture },
      elements
    },
    elements: elements.length,
    faces,
    heavy: faces > VANILLA_MAX_FACES * 4
  }
}
