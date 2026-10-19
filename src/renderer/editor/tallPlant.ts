// Tall plants (PackForge's "Alta" plant shape): the lower block draws `<name>.png`, the upper one
// `<name>_top.png`. The editor paints them as one canvas, the upper half on top, and saves the two
// files apart.

export interface TallHalves {
  /** The upper block's texture (`…_top.png`). */
  upper: string
  /** The lower block's texture. */
  lower: string
}

/**
 * The two halves of the tall plant `path` belongs to, when both are in the pack and neither is
 * animated (an animation strip can't be stacked); null otherwise. A random variant (`_v2`) pairs
 * with its stage's upper half, which it shares.
 */
export function tallHalves(path: string, inPack: (path: string) => boolean): TallHalves | null {
  const isUpper = /_top\.png$/.test(path)
  const lower = isUpper ? path.replace(/_top\.png$/, '.png') : path
  const upper = isUpper ? path : path.replace(/(_v\d+)?\.png$/, '_top.png')
  if (!inPack(upper) || !inPack(lower)) return null
  if (inPack(`${upper}.mcmeta`) || inPack(`${lower}.mcmeta`)) return null
  return { upper, lower }
}

export interface Pixels {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

/** One image with `upper` stacked on `lower` (same width), or null when the widths differ. */
export function stackHalves(
  upper: Pixels,
  lower: Pixels
): { width: number; height: number; data: Uint8Array } | null {
  if (upper.width !== lower.width) return null
  const data = new Uint8Array((upper.height + lower.height) * upper.width * 4)
  data.set(upper.data, 0)
  data.set(lower.data, upper.data.length)
  return { width: upper.width, height: upper.height + lower.height, data }
}

/** The two halves of a stacked image (`upperHeight` rows on top), copied. */
export function splitHalves(
  image: Pixels,
  upperHeight: number
): { upper: Uint8Array; lower: Uint8Array } {
  const cut = upperHeight * image.width * 4
  return {
    upper: new Uint8Array(image.data.slice(0, cut)),
    lower: new Uint8Array(image.data.slice(cut))
  }
}
