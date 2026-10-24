// Colour adjustments of the editor (Phase 19): hue / saturation / lightness / contrast in OKLab
// (shared/guiRecolor.ts recolorPixels) followed by levels (black point, white point, gamma), on
// the visible pixels only; alpha is never touched; a mask limits them to a selection. Pure.
import { recolorPixels, type RecolorSettings } from './guiRecolor'

export interface Levels {
  /** Input value mapped to 0 (0–254). */
  black: number
  /** Input value mapped to 255 (black + 1 – 255). */
  white: number
  /** Midtones: above 1 brighter, below 1 darker. */
  gamma: number
}

export const NEUTRAL_LEVELS: Levels = { black: 0, white: 255, gamma: 1 }

export interface Adjustments extends RecolorSettings {
  levels: Levels
}

export const NEUTRAL_ADJUSTMENTS: Adjustments = {
  hue: 0,
  saturation: 1,
  lightness: 0,
  contrast: 1,
  levels: NEUTRAL_LEVELS
}

/** The 256-entry table of a levels setting. */
export function levelsTable({ black, white, gamma }: Levels): Uint8Array {
  const table = new Uint8Array(256)
  const lo = Math.max(0, Math.min(254, Math.round(black)))
  const hi = Math.max(lo + 1, Math.min(255, Math.round(white)))
  const g = gamma > 0 ? gamma : 1
  for (let v = 0; v < 256; v++) {
    const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
    table[v] = Math.round(Math.pow(t, 1 / g) * 255)
  }
  return table
}

export function isNeutralAdjustments(a: Adjustments): boolean {
  return (
    a.hue === 0 &&
    a.saturation === 1 &&
    a.lightness === 0 &&
    a.contrast === 1 &&
    a.levels.black === 0 &&
    a.levels.white === 255 &&
    a.levels.gamma === 1
  )
}

/**
 * A new RGBA buffer with the adjustments applied to the visible pixels (and, with `mask`, only
 * where it is 1). Transparent pixels and alpha are kept.
 */
export function adjustPixels(
  rgba: Uint8ClampedArray | Uint8Array,
  adjustments: Adjustments,
  mask: Uint8Array | null = null
): Uint8ClampedArray {
  const recolored = recolorPixels(rgba, adjustments)
  const table = levelsTable(adjustments.levels)
  const out = new Uint8ClampedArray(rgba)
  for (let p = 0; p < out.length / 4; p++) {
    const i = p * 4
    if (out[i + 3] === 0 || (mask && mask[p] !== 1)) continue
    out[i] = table[recolored[i]!]!
    out[i + 1] = table[recolored[i + 1]!]!
    out[i + 2] = table[recolored[i + 2]!]!
  }
  return out
}
