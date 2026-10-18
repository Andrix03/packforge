// LabPBR `_n` generator: height from the albedo, then normals (R,G) and ambient occlusion (B) from
// the height (A). Pure, works on plain byte arrays so it runs in tests.
//
// Conventions (LabPBR 1.3): height 255 = surface, 0 = 25% of the block deep (the spec advises a
// minimum of 1: some packs' POM breaks on 0); normals in DirectX format (Y−): red 255 = right,
// green 255 = down; AO 255 = no occlusion. Textures tile, so neighbours wrap around the edges by
// default (PixelGraph and NormalMap-Online do the same); animation strips wrap inside each frame.

import { MAX_DEPTH } from './labpbr'

export const MIN_HEIGHT = 1

export interface HeightOptions {
  /** How deep the darkest pixel goes: 1 = the spec's full 25% of a block. */
  depth: number
  /** Light pixels become low instead of high (e.g. dark grout that stands out). */
  invert: boolean
  /** Stretches the texture's darkest…lightest pixel to the whole depth. */
  autoLevels: boolean
  /** Box blur radius in pixels before the levels (0 = keep every pixel's own height). */
  blur: number
  /** Rounds the height to this many steps (0 = continuous): blocky relief for pixel art. */
  steps: number
}

export const DEFAULT_HEIGHT: HeightOptions = {
  depth: 0.25,
  invert: false,
  autoLevels: true,
  blur: 0,
  steps: 0
}

export type NormalFilter = 'sobel' | 'scharr'

export interface NormalOptions {
  /** 1 = the slope of the real relief (the same depth POM shows); more = exaggerated. */
  strength: number
  filter: NormalFilter
}

export const DEFAULT_NORMALS: NormalOptions = { strength: 1, filter: 'sobel' }

export interface OcclusionOptions {
  /** 0 = no AO, 1 = the full horizon occlusion. */
  strength: number
  /** How far (in pixels) neighbours can shade a pixel; 0 = automatic (a quarter of the frame). */
  radius: number
}

export const DEFAULT_OCCLUSION: OcclusionOptions = { strength: 0.6, radius: 0 }

export interface MapGrid {
  width: number
  height: number
  /** Rows per animation frame (= height for a still texture). */
  frameHeight: number
  /** Neighbours across the edges wrap around (tiling texture) instead of repeating the border. */
  wrap: boolean
}

/** Height bytes (MIN_HEIGHT–255, one per pixel) from straight-alpha RGBA albedo. */
export function heightFromAlbedo(
  rgba: ArrayLike<number>,
  grid: MapGrid,
  options: HeightOptions
): Uint8Array {
  const { width, height } = grid
  const count = width * height
  const value = new Float32Array(count)
  const opaque = new Uint8Array(count)
  let sum = 0
  let opaqueCount = 0
  for (let i = 0; i < count; i++) {
    if (rgba[i * 4 + 3]! === 0) continue
    // Rec. 709 luma of the sRGB bytes: perceived lightness is what the artist shaded with.
    const luma =
      (0.2126 * rgba[i * 4]! + 0.7152 * rgba[i * 4 + 1]! + 0.0722 * rgba[i * 4 + 2]!) / 255
    value[i] = luma
    opaque[i] = 1
    sum += luma
    opaqueCount++
  }
  // Transparent pixels take the mean, so they neither dig holes nor raise walls when blurred.
  const mean = opaqueCount > 0 ? sum / opaqueCount : 1
  for (let i = 0; i < count; i++) if (!opaque[i]) value[i] = mean

  const blurred = options.blur > 0 ? boxBlur(value, grid, Math.round(options.blur)) : value

  let low = 0
  let high = 1
  if (options.autoLevels && opaqueCount > 0) {
    low = Infinity
    high = -Infinity
    for (let i = 0; i < count; i++) {
      if (!opaque[i]) continue
      low = Math.min(low, blurred[i]!)
      high = Math.max(high, blurred[i]!)
    }
    if (high - low < 1e-6) {
      low = 0
      high = 1
    }
  }
  const depth = Math.max(0, Math.min(1, options.depth))
  const out = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    if (!opaque[i]) {
      out[i] = 255
      continue
    }
    let level = Math.max(0, Math.min(1, (blurred[i]! - low) / (high - low)))
    if (options.invert) level = 1 - level
    if (options.steps >= 2) level = Math.round(level * (options.steps - 1)) / (options.steps - 1)
    const h = 1 - depth * (1 - level)
    out[i] = Math.max(MIN_HEIGHT, Math.min(255, Math.round(h * 255)))
  }
  return out
}

/**
 * Normal X/Y bytes (two per pixel: red, green) from height bytes, with a 3×3 Sobel or Scharr
 * gradient. Heights are converted to pixels of depth (25% of the frame width at byte 0), so
 * strength 1 matches the relief POM draws.
 */
export function normalsFromHeight(
  heights: ArrayLike<number>,
  grid: MapGrid,
  options: NormalOptions
): Uint8Array {
  const { width, height } = grid
  const scale = (MAX_DEPTH * width) / 255
  const [side, middle] = options.filter === 'scharr' ? [3, 10] : [1, 2]
  // Weights of one column/row, times the 2-pixel distance between the outer columns.
  const norm = 2 * (2 * side + middle)
  const at = sampler(heights, grid)
  const out = new Uint8Array(width * height * 2)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = at(x - 1, y - 1, y)
      const t = at(x, y - 1, y)
      const tr = at(x + 1, y - 1, y)
      const l = at(x - 1, y, y)
      const r = at(x + 1, y, y)
      const bl = at(x - 1, y + 1, y)
      const b = at(x, y + 1, y)
      const br = at(x + 1, y + 1, y)
      // Height gradient in pixels of depth per pixel (y grows downwards).
      const gx = ((side * (tr + br) + middle * r - side * (tl + bl) - middle * l) * scale) / norm
      const gy = ((side * (bl + br) + middle * b - side * (tl + tr) - middle * t) * scale) / norm
      const nx = -gx * options.strength
      const ny = -gy * options.strength
      const length = Math.hypot(nx, ny, 1)
      const i = (y * width + x) * 2
      out[i] = toByte(((nx / length) * 0.5 + 0.5) * 255)
      out[i + 1] = toByte(((ny / length) * 0.5 + 0.5) * 255)
    }
  }
  return out
}

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1]
]

/** Most distances the AO march looks at per direction. */
export const MAX_AO_STEPS = 32

/**
 * Ambient occlusion bytes (255 = open) from height bytes: in 8 directions, the highest horizon
 * within the radius hides part of the sky (horizon-based AO, like PixelGraph's ray march on the
 * height map but exact on the pixel grid).
 */
export function occlusionFromHeight(
  heights: ArrayLike<number>,
  grid: MapGrid,
  options: OcclusionOptions
): Uint8Array {
  const { width, height } = grid
  const scale = (MAX_DEPTH * width) / 255
  const radius =
    options.radius > 0 ? Math.round(options.radius) : Math.max(2, Math.round(width / 4))
  // Every pixel up to MAX_AO_STEPS (exact for textures up to 128 px); beyond, the march samples
  // MAX_AO_STEPS distances spread over the radius, so 512–1024 px textures take ~1 s, not minutes.
  const steps: number[] = []
  for (let k = 1; k <= Math.min(radius, MAX_AO_STEPS); k++) {
    steps.push(radius <= MAX_AO_STEPS ? k : Math.round((k * radius) / MAX_AO_STEPS))
  }
  const frame = Math.max(1, Math.min(grid.frameHeight, height))
  const strength = Math.max(0, Math.min(1, options.strength))
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    // The frame holding row y: neighbours wrap or clamp inside it (as `sampler`).
    const top = Math.floor(y / frame) * frame
    const rows = Math.min(frame, height - top)
    const fy0 = y - top
    for (let x = 0; x < width; x++) {
      const own = heights[y * width + x]! * scale
      let hidden = 0
      for (const [dx, dy] of DIRECTIONS) {
        const unit = Math.hypot(dx, dy)
        let slope = 0
        for (const step of steps) {
          let fx = x + dx * step
          let fy = fy0 + dy * step
          if (grid.wrap) {
            fx = ((fx % width) + width) % width
            fy = ((fy % rows) + rows) % rows
          } else {
            fx = fx < 0 ? 0 : fx >= width ? width - 1 : fx
            fy = fy < 0 ? 0 : fy >= rows ? rows - 1 : fy
          }
          const rise = heights[(top + fy) * width + fx]! * scale - own
          slope = Math.max(slope, rise / (step * unit))
        }
        // sin of the horizon's elevation = the share of that slice of sky it hides.
        hidden += slope / Math.hypot(1, slope)
      }
      out[y * width + x] = toByte((1 - strength * (hidden / DIRECTIONS.length)) * 255)
    }
  }
  return out
}

/** Reads a per-pixel value at (x, y), wrapping or clamping inside the frame that holds row `y0`. */
function sampler(
  values: ArrayLike<number>,
  { width, height, frameHeight, wrap }: MapGrid
): (x: number, y: number, y0: number) => number {
  const frame = Math.max(1, Math.min(frameHeight, height))
  return (x, y, y0) => {
    const top = Math.floor(y0 / frame) * frame
    const rows = Math.min(frame, height - top)
    let fx = x
    let fy = y - top
    if (wrap) {
      fx = ((fx % width) + width) % width
      fy = ((fy % rows) + rows) % rows
    } else {
      fx = Math.max(0, Math.min(width - 1, fx))
      fy = Math.max(0, Math.min(rows - 1, fy))
    }
    return values[(top + fy) * width + fx]!
  }
}

/** Separable box blur of one value per pixel, with the same edge handling as the gradients. */
function boxBlur(values: Float32Array, grid: MapGrid, radius: number): Float32Array {
  const { width, height } = grid
  const at = (source: Float32Array) => sampler(source, grid)
  const horizontal = new Float32Array(values.length)
  const readH = at(values)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let d = -radius; d <= radius; d++) sum += readH(x + d, y, y)
      horizontal[y * width + x] = sum / (2 * radius + 1)
    }
  }
  const out = new Float32Array(values.length)
  const readV = at(horizontal)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let d = -radius; d <= radius; d++) sum += readV(x, y + d, y)
      out[y * width + x] = sum / (2 * radius + 1)
    }
  }
  return out
}

function toByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}
