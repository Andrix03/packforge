// Compare my texture with the vanilla one: per-pixel differences, changed share, palettes and
// mean color shift. Pure. The vanilla pixels are only read (shown and measured), never copied.

import { rgbToOklab } from './colorVariants'

export interface Image {
  width: number
  height: number
  data: ArrayLike<number>
}

export interface Comparison {
  /** The grid both are compared on: the larger of the two (the other one scaled by nearest). */
  width: number
  height: number
  /** Per pixel: largest channel difference (alpha included), 0 = identical. */
  delta: Uint8Array
  changed: number
  total: number
  /** Pixels opaque in one and transparent in the other. */
  alphaChanged: number
  /** Distinct colors (opaque pixels). */
  colorsMine: number
  colorsVanilla: number
  /** Colors of mine that vanilla does not use. */
  newColors: number
  /** Mean color shift in OKLab ×100 (≈ ΔE): 0 = same overall color. */
  meanShift: number
  /** Lightness shift of the mean (OKLab L ×100): > 0 = mine is lighter. */
  lightnessShift: number
  /** Mine is an exact multiple of vanilla (or the reverse), e.g. 2 for a 32× of a 16×. */
  scale: number | null
}

/** Pixel (x, y) of `image` read on a `width`×`height` grid (nearest). */
function sampleAt(image: Image, width: number, height: number, x: number, y: number): number {
  const sx = Math.min(image.width - 1, Math.floor((x * image.width) / width))
  const sy = Math.min(image.height - 1, Math.floor((y * image.height) / height))
  return (sy * image.width + sx) * 4
}

function colorKey(data: ArrayLike<number>, i: number): number {
  return (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!
}

function scaleOf(mine: Image, vanilla: Image): number | null {
  const sx = mine.width / vanilla.width
  const sy = mine.height / vanilla.height
  if (sx !== sy) return null
  if (Number.isInteger(sx)) return sx
  return Number.isInteger(1 / sx) ? sx : null
}

/** Pixels whose difference is at most this are "the same" (rounding of other editors). */
export const SAME_TOLERANCE = 2

export function compareTextures(mine: Image, vanilla: Image): Comparison {
  const width = Math.max(mine.width, vanilla.width)
  const height = Math.max(mine.height, vanilla.height)
  const delta = new Uint8Array(width * height)
  let changed = 0
  let alphaChanged = 0
  const meanMine = [0, 0, 0]
  const meanVanilla = [0, 0, 0]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = sampleAt(mine, width, height, x, y)
      const b = sampleAt(vanilla, width, height, x, y)
      let d = 0
      for (let c = 0; c < 4; c++)
        d = Math.max(d, Math.abs(mine.data[a + c]! - vanilla.data[b + c]!))
      // Fully transparent pixels are equal whatever their hidden color.
      if (mine.data[a + 3] === 0 && vanilla.data[b + 3] === 0) d = 0
      delta[y * width + x] = d
      if (d > SAME_TOLERANCE) changed++
      if (mine.data[a + 3]! > 0 !== vanilla.data[b + 3]! > 0) alphaChanged++
    }
  }
  const colors = (image: Image, mean: number[]): Set<number> => {
    const set = new Set<number>()
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i + 3]! === 0) continue
      set.add(colorKey(image.data, i))
      const lab = rgbToOklab(image.data[i]!, image.data[i + 1]!, image.data[i + 2]!)
      for (let c = 0; c < 3; c++) mean[c]! += lab[c]!
    }
    return set
  }
  const mineColors = colors(mine, meanMine)
  const vanillaColors = colors(vanilla, meanVanilla)
  const opaqueMine = countOpaque(mine)
  const opaqueVanilla = countOpaque(vanilla)
  for (let c = 0; c < 3; c++) {
    meanMine[c]! /= opaqueMine || 1
    meanVanilla[c]! /= opaqueVanilla || 1
  }
  let newColors = 0
  for (const color of mineColors) if (!vanillaColors.has(color)) newColors++
  const both = opaqueMine > 0 && opaqueVanilla > 0
  return {
    width,
    height,
    delta,
    changed,
    total: width * height,
    alphaChanged,
    colorsMine: mineColors.size,
    colorsVanilla: vanillaColors.size,
    newColors,
    meanShift: both
      ? Math.hypot(
          meanMine[0]! - meanVanilla[0]!,
          meanMine[1]! - meanVanilla[1]!,
          meanMine[2]! - meanVanilla[2]!
        ) * 100
      : 0,
    lightnessShift: both ? (meanMine[0]! - meanVanilla[0]!) * 100 : 0,
    scale: scaleOf(mine, vanilla)
  }
}

function countOpaque(image: Image): number {
  let n = 0
  for (let i = 3; i < image.data.length; i += 4) if (image.data[i]! > 0) n++
  return n
}

/**
 * Heat map of the differences on the comparison grid: unchanged pixels show the vanilla texture
 * dimmed in gray, changed ones go from red (small) to yellow (large).
 */
export function diffImage(comparison: Comparison, vanilla: Image): Uint8ClampedArray {
  const { width, height, delta } = comparison
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const d = delta[i]!
      if (d > SAME_TOLERANCE) {
        const t = Math.min(1, d / 128)
        out.set([255, Math.round(40 + 215 * t), 40, 255], i * 4)
      } else {
        const b = sampleAt(vanilla, width, height, x, y)
        const gray = Math.round(
          (0.2126 * vanilla.data[b]! +
            0.7152 * vanilla.data[b + 1]! +
            0.0722 * vanilla.data[b + 2]!) *
            0.35
        )
        out.set([gray, gray, gray, vanilla.data[b + 3]! === 0 ? 0 : 255], i * 4)
      }
    }
  }
  return out
}

/** `image` drawn on the comparison grid (nearest), for side-by-side views at the same size. */
export function onGrid(image: Image, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = sampleAt(image, width, height, x, y)
      for (let c = 0; c < 4; c++) out[(y * width + x) * 4 + c] = image.data[from + c]!
    }
  }
  return out
}
