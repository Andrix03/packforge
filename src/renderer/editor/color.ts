// Pure color helpers for the editor panels: HSV conversion, perceived brightness, the colors a
// texture uses, recent colors.

import type { PixelBuffer, Rgba } from './pixels'

export interface Hsv {
  /** 0–360 */
  h: number
  /** 0–1 */
  s: number
  /** 0–1 */
  v: number
}

export function rgbToHsv([r, g, b]: Rgba): Hsv {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta > 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
  }
  return { h: h < 0 ? h + 360 : h, s: max === 0 ? 0 : delta / max, v: max / 255 }
}

export function hsvToRgb({ h, s, v }: Hsv, alpha = 255): Rgba {
  const hue = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255), alpha]
}

/** Perceived brightness 0–1 (Rec. 709 luma on sRGB values, good enough to sort swatches). */
export function luma([r, g, b]: Rgba): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

export function sameColor(a: Rgba, b: Rgba): boolean {
  // Every fully transparent color is the same color.
  if (a[3] === 0 && b[3] === 0) return true
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

export interface UsedColor {
  color: Rgba
  /** Number of pixels with this color. */
  count: number
}

/** Distinct visible colors of the texture, darkest first. Transparent pixels are not counted. */
export function usedColors(buffer: PixelBuffer): UsedColor[] {
  const counts = new Map<number, number>()
  const d = buffer.data
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue
    // Packed RGBA as an unsigned 32-bit key.
    const key = ((d[i]! << 24) | (d[i + 1]! << 16) | (d[i + 2]! << 8) | d[i + 3]!) >>> 0
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts]
    .map(([key, count]) => ({
      color: [key >>> 24, (key >>> 16) & 255, (key >>> 8) & 255, key & 255] as Rgba,
      count
    }))
    .sort((a, b) => luma(a.color) - luma(b.color) || b.count - a.count)
}

export const RECENT_LIMIT = 16

/** Puts `color` first in the recent list (no duplicates, transparent excluded). */
export function addRecent(recent: readonly Rgba[], color: Rgba, limit = RECENT_LIMIT): Rgba[] {
  if (color[3] === 0) return [...recent]
  return [color, ...recent.filter((c) => !sameColor(c, color))].slice(0, limit)
}

/** `#rrggbbaa` (lowercase), the format of saved palettes. */
export function toHex8([r, g, b, a]: Rgba): string {
  return '#' + [r, g, b, a].map((c) => c.toString(16).padStart(2, '0')).join('')
}

export const MAX_RAMP_COLORS = 16

/** Ramp from arbitrary colors: transparent and duplicates removed, darkest first, capped. */
export function toRamp(colors: readonly Rgba[]): Rgba[] {
  const unique: Rgba[] = []
  for (const color of colors) {
    if (color[3] === 0 || unique.some((c) => sameColor(c, color))) continue
    unique.push(color)
  }
  return unique.sort((a, b) => luma(a) - luma(b)).slice(0, MAX_RAMP_COLORS)
}
