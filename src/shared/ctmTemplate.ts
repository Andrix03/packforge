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
    return `Serve una texture quadrata (questa è ${image.width}×${image.height}: le texture animate non sono supportate).`
  }
  if (image.width < 4) return 'La texture è troppo piccola.'
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

function cornerBit(side: number, edge: number): number {
  if (edge === UP) return side === LEFT ? UP_LEFT : UP_RIGHT
  return side === LEFT ? DOWN_LEFT : DOWN_RIGHT
}

/**
 * The `.properties` of a generated set: tile-based (`matchTiles` = the texture's short name for
 * minecraft textures, `namespace:path` otherwise), connected by tile.
 */
export function ctmPropertiesFor(texturePath: string): {
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
      ['method', 'ctm'],
      ['matchTiles', tileName],
      ['tiles', '0-46'],
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
