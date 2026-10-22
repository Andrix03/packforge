// Nearest-neighbour resize of textures (and their maps) between resolutions: 16×, 32×, 64×…
// Pure. Integer factors only (×2, ×4, ½, ¼…), so pixel art stays sharp and LabPBR values stay
// exact (metal codes, emission): unlike the bilinear resize Iris applies to mismatched maps.
//
// Why uniform resolutions matter: the block atlas gets the smallest mipmap level any of its
// textures allows, so one leftover 16× texture caps the mipmaps of a 64× pack.

import { MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from './pngCodec'

export interface Image {
  width: number
  height: number
  data: ArrayLike<number>
}

/** A scale factor as up/down integers: ×2 = {up: 2, down: 1}, ½ = {up: 1, down: 2}. */
export interface Factor {
  up: number
  down: number
}

export const RESOLUTIONS = [16, 32, 64, 128, 256, 512] as const

/** Factor taking `from` px to `to` px, or null when it is not an integer ratio either way. */
export function factorBetween(from: number, to: number): Factor | null {
  if (from <= 0 || to <= 0) return null
  if (to % from === 0) return { up: to / from, down: 1 }
  if (from % to === 0) return { up: 1, down: from / to }
  return null
}

export function scaledSize(
  width: number,
  height: number,
  factor: Factor
): {
  width: number
  height: number
} | null {
  if (width % factor.down !== 0 || height % factor.down !== 0) return null
  const w = (width / factor.down) * factor.up
  const h = (height / factor.down) * factor.up
  if (w > MAX_IMAGE_SIDE || h > MAX_IMAGE_SIDE || w * h > MAX_IMAGE_PIXELS) return null
  return { width: w, height: h }
}

export interface Scaled {
  width: number
  height: number
  data: Uint8ClampedArray
  /** Shrinking merged blocks whose pixels were not all equal (details lost). */
  lossy: boolean
}

/**
 * Nearest-neighbour scale. Shrinking keeps the top-left pixel of each block and reports
 * whether any block had different pixels (exact only for textures that were enlarged before).
 */
export function scaleNearest(image: Image, factor: Factor): Scaled | null {
  const size = scaledSize(image.width, image.height, factor)
  if (!size) return null
  const { width, height } = size
  const out = new Uint8ClampedArray(width * height * 4)
  const { up, down } = factor
  for (let y = 0; y < height; y++) {
    const sy = Math.floor((y * down) / up)
    for (let x = 0; x < width; x++) {
      const sx = Math.floor((x * down) / up)
      const from = (sy * image.width + sx) * 4
      for (let c = 0; c < 4; c++) out[(y * width + x) * 4 + c] = image.data[from + c]!
    }
  }
  let lossy = false
  if (down > 1) {
    outer: for (let by = 0; by < image.height; by += down) {
      for (let bx = 0; bx < image.width; bx += down) {
        const first = (by * image.width + bx) * 4
        for (let y = by; y < by + down; y++) {
          for (let x = bx; x < bx + down; x++) {
            const i = (y * image.width + x) * 4
            for (let c = 0; c < 4; c++) {
              if (image.data[i + c] !== image.data[first + c]) {
                lossy = true
                break outer
              }
            }
          }
        }
      }
    }
  }
  return { width, height, data: out, lossy }
}

/**
 * A `.png.mcmeta` text with the explicit frame sizes (animation width/height) scaled; null when
 * nothing has to change (no explicit sizes, or not JSON). Throws when a frame size would not be
 * a whole number of pixels (e.g. 15 px frames halved): the game would show a broken animation.
 */
export function scaleMcmeta(text: string, factor: Factor): string | null {
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof root !== 'object' || root === null) return null
  const section = (root as Record<string, unknown>)['animation']
  if (typeof section !== 'object' || section === null) return null
  const animation = section as Record<string, unknown>
  let changed = false
  for (const key of ['width', 'height']) {
    const value = animation[key]
    if (typeof value === 'number') {
      const scaled = (value / factor.down) * factor.up
      if (!Number.isInteger(scaled)) {
        throw new Error(
          `i frame dell'animazione (${key} ${value}) non si possono dividere per ${factor.down}`
        )
      }
      animation[key] = scaled
      changed = true
    }
  }
  return changed ? `${JSON.stringify(root, null, 2)}\n` : null
}

/** How many textures are at each resolution (their width: frames stack vertically), most common first. */
export function resolutionHistogram(
  widths: readonly number[]
): Array<{ resolution: number; count: number }> {
  const counts = new Map<number, number>()
  for (const width of widths) counts.set(width, (counts.get(width) ?? 0) + 1)
  return [...counts.entries()]
    .map(([resolution, count]) => ({ resolution, count }))
    .sort((a, b) => b.count - a.count || a.resolution - b.resolution)
}
