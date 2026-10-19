// Mipmaps made like the game (26.3, read from the client's MipmapGenerator / TextureUtil /
// ARGB, 2026-10-19), so far plants and leaves look as in game instead of growing dark fringes
// (a plain GPU average mixes in the black of see-through pixels).
//
// - Strategy from the `.png.mcmeta` "texture" section: `mipmap_strategy` (auto, mean, cutout,
//   strict_cutout, dark_cutout; default auto) and `alpha_cutoff_bias` (default 0). Auto = cutout
//   when the texture has fully transparent pixels, else mean.
// - Cutout (not for item textures): the transparent pixels first take the color of the nearest
//   visible pixel (breadth-first, 4 neighbours: "solidify"); dark cutout fills them with 3/4 of the
//   darkest visible color instead.
// - Each level averages 2×2 pixels: alpha linearly, colors in linear light; dark cutout averages
//   only the visible pixels (still divided by 4).
// - Cutout levels then rescale alpha (5 bisection steps) so as many sub-samples pass the alpha
//   test (0.5, strict 0.3) as in the full-size texture, + bias + 0.025.
// The game's sRGB tables are replaced by the exact formulas (differences of a unit at most).

export type MipmapStrategy = 'auto' | 'mean' | 'cutout' | 'strict_cutout' | 'dark_cutout'

export const MIPMAP_STRATEGIES: readonly MipmapStrategy[] = [
  'auto',
  'mean',
  'cutout',
  'strict_cutout',
  'dark_cutout'
]

export interface MipImage {
  width: number
  height: number
  /** Straight RGBA. */
  data: Uint8Array
}

export interface MipOptions {
  strategy: MipmapStrategy
  alphaCutoffBias: number
  /** Item textures are never solidified. */
  item: boolean
}

/** The "texture" section of a `.png.mcmeta` (defaults when absent or invalid). */
export function mipOptionsFromMcmeta(mcmeta: unknown, item = false): MipOptions {
  const section =
    typeof mcmeta === 'object' && mcmeta !== null
      ? (mcmeta as Record<string, unknown>)['texture']
      : null
  const record =
    typeof section === 'object' && section !== null ? (section as Record<string, unknown>) : {}
  const strategy = MIPMAP_STRATEGIES.find((s) => s === record['mipmap_strategy']) ?? 'auto'
  const bias = record['alpha_cutoff_bias']
  return {
    strategy,
    alphaCutoffBias: typeof bias === 'number' && Number.isFinite(bias) ? bias : 0,
    item
  }
}

const toLinear = (c: number): number => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const toSrgb = (l: number): number => {
  const v = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(v * 255)))
}

function hasTransparent(image: MipImage): boolean {
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i] === 0) return true
  return false
}

/** See-through pixels take the color of the nearest visible one (alpha stays 0). */
export function solidify(image: MipImage): void {
  const { width, height, data } = image
  const count = width * height
  const source = new Int32Array(count).fill(-1)
  const distance = new Int32Array(count).fill(0x7fffffff)
  const queue: number[] = []
  // Seeds in the game's order: x outer, y inner.
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const i = x + y * width
      if (data[i * 4 + 3] !== 0) {
        distance[i] = 0
        source[i] = i
        queue.push(i)
      }
    }
  }
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ] as const
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!
    const x = i % width
    const y = Math.floor(i / width)
    for (const [dx, dy] of steps) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const n = nx + ny * width
      if (distance[n]! <= distance[i]! + 1) continue
      distance[n] = distance[i]! + 1
      source[n] = source[i]!
      queue.push(n)
    }
  }
  for (let i = 0; i < count; i++) {
    if (data[i * 4 + 3] !== 0 || source[i]! < 0) continue
    const s = source[i]! * 4
    data[i * 4] = data[s]!
    data[i * 4 + 1] = data[s + 1]!
    data[i * 4 + 2] = data[s + 2]!
  }
}

/** See-through pixels take 3/4 of the darkest visible color (alpha stays 0). */
function fillWithDark(image: MipImage): void {
  const { data } = image
  let best = -1
  let bestSum = Infinity
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const sum = data[i]! + data[i + 1]! + data[i + 2]!
    if (sum < bestSum) {
      bestSum = sum
      best = i
    }
  }
  if (best < 0) return
  const dark = [0, 1, 2].map((c) => Math.floor((data[best + c]! * 3) / 4))
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0) continue
    data[i] = dark[0]!
    data[i + 1] = dark[1]!
    data[i + 2] = dark[2]!
  }
}

/** Share of alpha-test sub-samples (4×4 per pixel square, bilinear) above `cutoff`. */
export function alphaTestCoverage(image: MipImage, cutoff: number, scale: number): number {
  const { width, height, data } = image
  const alpha = (x: number, y: number): number =>
    Math.min(1, Math.max(0, (data[(x + y * width) * 4 + 3]! / 255) * scale))
  let coverage = 0
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a00 = alpha(x, y)
      const a10 = alpha(x + 1, y)
      const a01 = alpha(x, y + 1)
      const a11 = alpha(x + 1, y + 1)
      let passed = 0
      for (let j = 0; j < 4; j++) {
        const fy = (j + 0.5) / 4
        for (let i = 0; i < 4; i++) {
          const fx = (i + 0.5) / 4
          const value =
            a00 * (1 - fx) * (1 - fy) + a10 * fx * (1 - fy) + a01 * (1 - fx) * fy + a11 * fx * fy
          if (value > cutoff) passed++
        }
      }
      coverage += passed / 16
    }
  }
  // 0/0 for 1-pixel-wide levels, like the game (the bisection then keeps scale 1).
  return coverage / ((width - 1) * (height - 1))
}

function scaleAlphaToCoverage(image: MipImage, target: number, cutoff: number, bias: number): void {
  let low = 0
  let high = 4
  let scale = 1
  let best = 1
  let bestDiff = Number.MAX_VALUE
  for (let step = 0; step < 5; step++) {
    const coverage = alphaTestCoverage(image, cutoff, scale)
    const diff = Math.abs(coverage - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = scale
    }
    if (coverage < target) low = scale
    else if (coverage > target) high = scale
    else break
    scale = (low + high) * 0.5
  }
  const { data } = image
  for (let i = 3; i < data.length; i += 4) {
    const a = Math.min(1, Math.max(0, (data[i]! / 255) * best + bias + 0.025))
    data[i] = Math.floor(a * 255)
  }
}

/**
 * Mip levels 0…`levels` of a texture (level 0 is a copy, solidified for cutout). Stops early when
 * a side would reach 0.
 */
export function gameMipLevels(level0: MipImage, levels: number, options: MipOptions): MipImage[] {
  const base: MipImage = {
    width: level0.width,
    height: level0.height,
    data: new Uint8Array(level0.data)
  }
  const strategy =
    options.strategy === 'auto' ? (hasTransparent(base) ? 'cutout' : 'mean') : options.strategy
  if (!options.item) {
    if (strategy === 'cutout' || strategy === 'strict_cutout') solidify(base)
    else if (strategy === 'dark_cutout') fillWithDark(base)
  }
  const cutout = strategy === 'cutout' || strategy === 'strict_cutout' || strategy === 'dark_cutout'
  const cutoff = strategy === 'strict_cutout' ? 0.3 : 0.5
  const target = cutout ? alphaTestCoverage(base, cutoff, 1) : 0
  const result = [base]
  for (let level = 1; level <= levels; level++) {
    const previous = result[level - 1]!
    const width = previous.width >> 1
    const height = previous.height >> 1
    if (width < 1 || height < 1) break
    const data = new Uint8Array(width * height * 4)
    const p = previous.data
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const corners = [
          (2 * x + 2 * y * previous.width) * 4,
          (2 * x + 1 + 2 * y * previous.width) * 4,
          (2 * x + (2 * y + 1) * previous.width) * 4,
          (2 * x + 1 + (2 * y + 1) * previous.width) * 4
        ]
        const o = (x + y * width) * 4
        if (strategy === 'dark_cutout') {
          // Only the visible pixels count (in linear light, alpha included), still over 4.
          const sum = [0, 0, 0, 0]
          for (const c of corners) {
            if (p[c + 3] === 0) continue
            for (let k = 0; k < 4; k++) sum[k]! += toLinear(p[c + k]!)
          }
          data[o] = toSrgb(sum[0]! / 4)
          data[o + 1] = toSrgb(sum[1]! / 4)
          data[o + 2] = toSrgb(sum[2]! / 4)
          data[o + 3] = toSrgb(sum[3]! / 4)
        } else {
          for (let k = 0; k < 3; k++) {
            data[o + k] = toSrgb(corners.reduce((sum, c) => sum + toLinear(p[c + k]!), 0) / 4)
          }
          data[o + 3] = Math.floor(corners.reduce((sum, c) => sum + p[c + 3]!, 0) / 4)
        }
      }
    }
    const image = { width, height, data }
    if (cutout) scaleAlphaToCoverage(image, target, cutoff, options.alphaCutoffBias)
    result.push(image)
  }
  return result
}
