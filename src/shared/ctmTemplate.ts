// CTM template generator: the 47 tiles of the `ctm` method from one bordered texture (e.g. a glass
// pane with its frame), optionally with a separate borderless "center" texture. Pure.
//
// Each tile keeps the frame on the sides that do not connect. The frame is a band `border` pixels
// wide along each edge. In a corner where both bands meet:
// - neither side connects → the outer corner of the frame;
// - one side connects → the other side's band runs on through the corner;
// - both connect, diagonal does not → an inner corner (the frame's corner pixels);
// - both and the diagonal connect → the center.
// Without a center texture the center is the frame's own interior, shifted over the band.

import {
  CTM_TILE_MASKS,
  DOWN,
  DOWN_LEFT,
  DOWN_RIGHT,
  LEFT,
  RIGHT,
  UP,
  UP_LEFT,
  UP_RIGHT
} from './ctm'
import { tr } from './i18n'

export interface Image {
  width: number
  height: number
  data: ArrayLike<number>
}

export interface CtmTemplateOptions {
  /** Width of the frame band in pixels (≥ 1, < a third of the side). */
  border: number
}

export function maxBorder(size: number): number {
  return Math.max(1, Math.floor((size - 1) / 3))
}

/** Why the texture cannot be a CTM source (not square, too small), or null. */
export function templateProblem(image: { width: number; height: number }): string | null {
  if (image.width !== image.height) {
    return tr(
      'Serve una texture quadrata (questa è {0}×{1}: le texture animate non sono supportate).',
      image.width,
      image.height
    )
  }
  if (image.width < 4) return tr('La texture è troppo piccola.')
  return null
}

export function ctmTiles(
  bordered: Image,
  center: Image | null,
  options: CtmTemplateOptions
): Uint8ClampedArray[] {
  return CTM_TILE_MASKS.map((mask) => ctmTileImage(bordered, center, mask, options))
}

/** One tile for a neighbour mask (see `ctm.ts` for the bits). */
export function ctmTileImage(
  bordered: Image,
  center: Image | null,
  mask: number,
  options: CtmTemplateOptions
): Uint8ClampedArray {
  const { width: w, height: h } = bordered
  const t = Math.max(1, Math.min(options.border, maxBorder(Math.min(w, h))))
  const out = new Uint8ClampedArray(w * h * 4)
  const read = (image: Image, x: number, y: number): number => {
    const sx = Math.min(image.width - 1, Math.max(0, Math.floor((x * image.width) / w)))
    const sy = Math.min(image.height - 1, Math.max(0, Math.floor((y * image.height) / h)))
    return (sy * image.width + sx) * 4
  }
  // Pixel moved out of the bands it lies in (towards the inside).
  const inward = (x: number, y: number): [number, number] => [
    x < t ? x + t : x >= w - t ? x - t : x,
    y < t ? y + t : y >= h - t ? y - t : y
  ]
  const centerAt = (x: number, y: number): [Image, number] =>
    center ? [center, read(center, x, y)] : [bordered, read(bordered, ...inward(x, y))]

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const side = x < t ? LEFT : x >= w - t ? RIGHT : 0
      const edge = y < t ? UP : y >= h - t ? DOWN : 0
      const hc = side !== 0 && (mask & side) !== 0
      const vc = edge !== 0 && (mask & edge) !== 0
      let source: [Image, number]
      if (side === 0 && edge === 0) {
        source = [bordered, read(bordered, x, y)]
      } else if (edge === 0) {
        source = hc ? centerAt(x, y) : [bordered, read(bordered, x, y)]
      } else if (side === 0) {
        source = vc ? centerAt(x, y) : [bordered, read(bordered, x, y)]
      } else if (!hc && !vc) {
        source = [bordered, read(bordered, x, y)]
      } else if (hc && !vc) {
        // The top/bottom band runs on through the corner.
        source = [bordered, read(bordered, side === LEFT ? x + t : x - t, y)]
      } else if (!hc && vc) {
        source = [bordered, read(bordered, x, edge === UP ? y + t : y - t)]
      } else {
        const diagonal = cornerBit(side, edge)
        source = mask & diagonal ? centerAt(x, y) : [bordered, read(bordered, x, y)]
      }
      const [image, at] = source
      for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = image.data[at + c]!
    }
  }
  return out
}

/** Methods PackForge generates: the 47-tile `ctm` and the 4-tile `horizontal` / `vertical`. */
export type CtmMethod = 'ctm' | 'horizontal' | 'vertical'

/**
 * Neighbour masks of the 4 tiles of the line methods, in tile order. OptiFine and Continuity
 * (HorizontalSpriteProvider: index map [3, 2, 0, 1] over left = bit 0, right = bit 1; vertical:
 * below = bit 0, above = bit 1) agree: 0 = connected on the right (start of a row) / above (bottom
 * of a column), 1 = both sides, 2 = left (end of a row) / below (top of a column), 3 = alone.
 */
export const LINE_TILE_MASKS: Readonly<Record<'horizontal' | 'vertical', readonly number[]>> = {
  horizontal: [RIGHT, LEFT | RIGHT, LEFT, 0],
  vertical: [UP, UP | DOWN, DOWN, 0]
}

/** The tiles of a method: 47 for `ctm`, 4 for the line methods. */
export function methodTiles(
  bordered: Image,
  center: Image | null,
  options: CtmTemplateOptions,
  method: CtmMethod
): Uint8ClampedArray[] {
  if (method === 'ctm') return ctmTiles(bordered, center, options)
  return LINE_TILE_MASKS[method].map((mask) => ctmTileImage(bordered, center, mask, options))
}

/**
 * Tile of a block for a line method from its two neighbours along the line: left / right for
 * `horizontal`, below / above for `vertical` (the bit order of Continuity).
 */
export function lineTileIndex(first: boolean, second: boolean): number {
  return [3, 2, 0, 1][(first ? 1 : 0) | (second ? 2 : 0)]!
}

function cornerBit(side: number, edge: number): number {
  if (edge === UP) return side === LEFT ? UP_LEFT : UP_RIGHT
  return side === LEFT ? DOWN_LEFT : DOWN_RIGHT
}

/**
 * The `.properties` of a generated set: tile-based (`matchTiles` = the texture's short name for
 * minecraft textures, `namespace:path` otherwise), connected by tile.
 */
export function ctmPropertiesFor(
  texturePath: string,
  method: CtmMethod = 'ctm'
): {
  tileName: string
  entries: Array<[string, string]>
} {
  const match = /^assets\/([^/]+)\/textures\/(.+)\.png$/.exec(texturePath)
  const namespace = match?.[1] ?? 'minecraft'
  const path = match?.[2] ?? texturePath
  const short = path.slice(path.lastIndexOf('/') + 1)
  const tileName = namespace === 'minecraft' ? short : `${namespace}:${path}`
  return {
    tileName,
    entries: [
      ['method', method],
      ['matchTiles', tileName],
      ['tiles', method === 'ctm' ? '0-46' : '0-3'],
      ['connect', 'tile']
    ]
  }
}

/** Folder of a generated set: `assets/<ns>/optifine/ctm/<name>/`. */
export function ctmFolderFor(texturePath: string): string {
  const match = /^assets\/([^/]+)\/textures\/(.+)\.png$/.exec(texturePath)
  const namespace = match?.[1] ?? 'minecraft'
  const path = match?.[2] ?? texturePath
  return `assets/${namespace}/optifine/ctm/${path.slice(path.lastIndexOf('/') + 1)}`
}
