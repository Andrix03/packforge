// Color ramps with hue shifting, the classic pixel-art shading technique: shadows move toward a
// cool hue and get more saturated, highlights move toward a warm hue and get less saturated,
// instead of only changing brightness (which looks "muddy").

import { hsvToRgb, rgbToHsv, sameColor, type Hsv } from './color'
import {
  fillRegion,
  paintPixels,
  type FillMode,
  type PixelBuffer,
  type PixelChange,
  type Rgba
} from './pixels'

export interface RampOptions {
  /** Shades on each side of the base color (2 → 5 colors). */
  steps: number
  /** Hue rotation per step, in degrees, toward cool (shadows) / warm (highlights). */
  hueShift: number
  /** Brightness change per step (0–1 of the HSV value). Vanilla textures are low-contrast. */
  contrast: number
}

export const DEFAULT_RAMP: RampOptions = { steps: 2, hueShift: 10, contrast: 0.09 }

/** Hues the shading moves toward: blue-violet for shadows, yellow-orange for light. */
const COOL_HUE = 245
const WARM_HUE = 50
const SATURATION_STEP = 0.06
const GRAY_SATURATION = 0.05
const GRAY_TINT = 0.03

/** Darkest to lightest, base color in the middle; adjacent duplicates are removed. */
export function generateRamp(base: Rgba, options: RampOptions = DEFAULT_RAMP): Rgba[] {
  const hsv = rgbToHsv(base)
  const colors: Rgba[] = []
  for (let i = -options.steps; i <= options.steps; i++) {
    const color = i === 0 ? base : hsvToRgb(shade(hsv, i, options), base[3] === 0 ? 255 : base[3])
    if (!colors.length || !sameColor(colors[colors.length - 1]!, color)) colors.push(color)
  }
  return colors
}

function shade(base: Hsv, step: number, options: RampOptions): Hsv {
  const distance = Math.abs(step)
  const target = step < 0 ? COOL_HUE : WARM_HUE
  const v = clamp(base.v + options.contrast * step, 0.03, 1)
  if (base.s < GRAY_SATURATION) {
    // A gray's hue is meaningless (0 = red): tint it straight toward the target, just a little,
    // proportionally to the hue shift so 0 keeps a neutral gray ramp.
    const tint = GRAY_TINT * distance * (options.hueShift / DEFAULT_RAMP.hueShift)
    return tint > 0 ? { h: target, s: clamp01(base.s + tint), v } : { ...base, v }
  }
  return {
    h: rotateToward(base.h, target, options.hueShift * distance),
    s: clamp01(base.s + (step < 0 ? SATURATION_STEP : -SATURATION_STEP) * distance),
    v
  }
}

/** Rotates `hue` toward `target` along the shorter arc, by at most `amount` degrees. */
export function rotateToward(hue: number, target: number, amount: number): number {
  const delta = ((target - hue + 540) % 360) - 180
  const move = Math.sign(delta) * Math.min(Math.abs(delta), amount)
  return (hue + move + 360) % 360
}

/**
 * Index of `color` in the ramp, or -1. The shade tool only touches ramp colors (like Aseprite's
 * shading ink), so painting over other details never destroys them.
 */
export function rampIndex(ramp: readonly Rgba[], color: Rgba): number {
  return ramp.findIndex((entry) => sameColor(entry, color))
}

/** One step darker (-1) or lighter (+1) along the ramp; null if the color is not in it. */
export function shiftAlongRamp(ramp: readonly Rgba[], color: Rgba, direction: 1 | -1): Rgba | null {
  const index = rampIndex(ramp, color)
  if (index === -1) return null
  return ramp[Math.min(ramp.length - 1, Math.max(0, index + direction))]!
}

/**
 * Picks ramp colors at random, more often near the middle (weights 1, 2, 4, 2, 1 for five
 * colors): a base for stone, dirt and gravel that the user then cleans up by hand.
 */
export function noiseColor(ramp: readonly Rgba[], random: () => number): Rgba {
  const middle = (ramp.length - 1) / 2
  const weights = ramp.map((_, i) => 2 ** (middle - Math.abs(i - middle)))
  let pick = random() * weights.reduce((sum, w) => sum + w, 0)
  for (let i = 0; i < ramp.length; i++) {
    pick -= weights[i]!
    if (pick < 0) return ramp[i]!
  }
  return ramp[ramp.length - 1]!
}

/** Noise fill: the bucket's region (area or global) painted with random ramp colors. */
export function noiseFill(
  buffer: PixelBuffer,
  x: number,
  y: number,
  ramp: readonly Rgba[],
  mode: FillMode,
  random: () => number = Math.random
): PixelChange[] {
  if (ramp.length === 0) return []
  return paintPixels(buffer, fillRegion(buffer, x, y, mode), () => noiseColor(ramp, random))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
