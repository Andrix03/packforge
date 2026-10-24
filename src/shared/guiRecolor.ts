// Recolouring a pack's GUI textures in one go (a dark mode, a warmer or cooler interface). Works in
// OKLab, so a hue turn keeps the perceived lightness and a lightness change keeps the hue; the
// alpha channel is never touched. Pure.
import { oklabToRgb, rgbToOklab } from './colorVariants'
import { mapKindOf } from './labpbr'

export interface RecolorSettings {
  /** Degrees around the colour wheel. */
  hue: number
  /** Chroma multiplier, 0 = grey, 1 = as it is. */
  saturation: number
  /** Added to OKLab lightness (−1…1). */
  lightness: number
  /** Lightness spread around the middle, 1 = as it is. */
  contrast: number
}

export const NEUTRAL: RecolorSettings = { hue: 0, saturation: 1, lightness: 0, contrast: 1 }

export type RecolorPreset = 'dark' | 'warm' | 'cool' | 'grey'

export const RECOLOR_PRESETS: Record<RecolorPreset, RecolorSettings> = {
  // Panels and buttons go dark, keeping their shading readable.
  dark: { hue: 0, saturation: 0.8, lightness: -0.42, contrast: 0.85 },
  warm: { hue: 18, saturation: 1.15, lightness: 0, contrast: 1 },
  cool: { hue: -22, saturation: 1.1, lightness: 0, contrast: 1 },
  grey: { hue: 0, saturation: 0, lightness: 0, contrast: 1 }
}

export function isNeutral(settings: RecolorSettings): boolean {
  return (
    settings.hue === 0 &&
    settings.saturation === 1 &&
    settings.lightness === 0 &&
    settings.contrast === 1
  )
}

/** A new RGBA buffer with every visible pixel recoloured; fully transparent pixels stay as they are. */
export function recolorPixels(
  rgba: Uint8ClampedArray | Uint8Array,
  settings: RecolorSettings
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba)
  const turn = (settings.hue * Math.PI) / 180
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const cache = new Map<number, [number, number, number]>()
  for (let i = 0; i < out.length; i += 4) {
    if ((out[i + 3] ?? 0) === 0) continue
    const r = out[i] ?? 0
    const g = out[i + 1] ?? 0
    const b = out[i + 2] ?? 0
    const key = (r << 16) | (g << 8) | b
    let rgb = cache.get(key)
    if (!rgb) {
      const [L, A, B] = rgbToOklab(r, g, b)
      const a = (A * cos - B * sin) * settings.saturation
      const bb = (A * sin + B * cos) * settings.saturation
      const lightness = Math.min(
        1,
        Math.max(0, (L - 0.5) * settings.contrast + 0.5 + settings.lightness)
      )
      rgb = oklabToRgb([lightness, a, bb])
      cache.set(key, rgb)
    }
    out[i] = rgb[0]
    out[i + 1] = rgb[1]
    out[i + 2] = rgb[2]
  }
  return out
}

/** The pack's GUI textures (not their LabPBR maps), sorted: what a recolour may change. */
export function packGuiTextures(files: Iterable<string>): string[] {
  return [...files]
    .filter((f) => /^assets\/[^/]+\/textures\/gui\/.+\.png$/.test(f) && mapKindOf(f) === null)
    .sort()
}

/** Texture folders of the pack (`textures/<area>/…`), most textures first, for a recolour. */
export function packTextureAreas(files: Iterable<string>): Array<{ area: string; count: number }> {
  const counts = new Map<string, number>()
  for (const f of files) {
    const m = /^assets\/[^/]+\/textures\/([^/]+)\/.+\.png$/.exec(f)
    if (!m || mapKindOf(f) !== null || /_e\.png$/.test(f)) continue
    counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1)
  }
  return [...counts]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area))
}

/** The pack's textures of an area (`null` = every area), not their maps or `_e` overlays. */
export function packTexturesIn(files: Iterable<string>, area: string | null): string[] {
  return [...files]
    .filter((f) => {
      const m = /^assets\/[^/]+\/textures\/([^/]+)\/.+\.png$/.exec(f)
      return (
        m !== null &&
        (area === null || m[1] === area) &&
        mapKindOf(f) === null &&
        !/_e\.png$/.test(f)
      )
    })
    .sort()
}
