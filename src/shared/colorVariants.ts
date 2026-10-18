// Color variants of a texture (e.g. every wool color from one wool). Pure.
//
// Colors: the 16 dyes' `textureDiffuseColor` read from the 26.3 client (DyeColor). Recoloring
// works in OKLab (perceptual): each pixel keeps its offset from the texture's mean lightness and
// color, and the mean moves to the dye color. Shading and details survive, and white, black and
// grays work too (a plain hue rotation cannot make white or black).

export interface Dye {
  /** Game id, used in file names (`light_blue_wool`). */
  id: string
  label: string
  /** sRGB hex without '#'. */
  hex: string
}

export const DYES: readonly Dye[] = [
  { id: 'white', label: 'Bianco', hex: 'f9fffe' },
  { id: 'light_gray', label: 'Grigio chiaro', hex: '9d9d97' },
  { id: 'gray', label: 'Grigio', hex: '474f52' },
  { id: 'black', label: 'Nero', hex: '1d1d21' },
  { id: 'brown', label: 'Marrone', hex: '835432' },
  { id: 'red', label: 'Rosso', hex: 'b02e26' },
  { id: 'orange', label: 'Arancione', hex: 'f9801d' },
  { id: 'yellow', label: 'Giallo', hex: 'fed83d' },
  { id: 'lime', label: 'Lime', hex: '80c71f' },
  { id: 'green', label: 'Verde', hex: '5e7c16' },
  { id: 'cyan', label: 'Ciano', hex: '169c9c' },
  { id: 'light_blue', label: 'Azzurro', hex: '3ab3da' },
  { id: 'blue', label: 'Blu', hex: '3c44aa' },
  { id: 'purple', label: 'Viola', hex: '8932b8' },
  { id: 'magenta', label: 'Magenta', hex: 'c74ebd' },
  { id: 'pink', label: 'Rosa', hex: 'f38baa' }
]

// Longest ids first, so "light_blue" is not read as "blue".
const BY_LENGTH = [...DYES].sort((a, b) => b.id.length - a.id.length)

/** The dye a texture name is made of (`light_blue_wool` → light_blue), or null. */
export function dyeOf(name: string): Dye | null {
  for (const dye of BY_LENGTH) {
    const at = name.indexOf(dye.id)
    if (at === -1) continue
    const before = at === 0 || name[at - 1] === '_'
    const after = at + dye.id.length === name.length || name[at + dye.id.length] === '_'
    // "light_gray" contains "gray": only whole words count, the longest first.
    if (before && after) return dye
  }
  return null
}

/** File name (without .png) of a variant: the dye word replaced, or the dye as a prefix. */
export function variantName(name: string, dye: Dye): string {
  const own = dyeOf(name)
  if (!own) return `${dye.id}_${name}`
  const at = name.indexOf(own.id)
  return name.slice(0, at) + dye.id + name.slice(at + own.id.length)
}

type Lab = [number, number, number]

function toLinear(c: number): number {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function toSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(c * 255)))
}

/** sRGB bytes → OKLab (Björn Ottosson's matrices). */
export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

/** OKLab → sRGB bytes (clamped to the gamut per channel). */
export function oklabToRgb([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  ]
}

export interface RecolorOptions {
  /** How much of the texture's light/dark variation is kept (1 = all). */
  contrast: number
  /** How much of the texture's own color variation is kept (1 = all, 0 = flat dye hue). */
  colorDetail: number
}

export const DEFAULT_RECOLOR: RecolorOptions = { contrast: 1, colorDetail: 0.5 }

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The texture recolored around `targetHex` (alpha kept, transparent pixels untouched). */
export function recolor(
  rgba: ArrayLike<number>,
  targetHex: string,
  options: RecolorOptions = DEFAULT_RECOLOR
): Uint8ClampedArray {
  const pixels = rgba.length / 4
  const labs: Lab[] = new Array<Lab>(pixels)
  const mean: Lab = [0, 0, 0]
  let count = 0
  for (let i = 0; i < pixels; i++) {
    if (rgba[i * 4 + 3]! === 0) continue
    const lab = rgbToOklab(rgba[i * 4]!, rgba[i * 4 + 1]!, rgba[i * 4 + 2]!)
    labs[i] = lab
    for (let c = 0; c < 3; c++) mean[c]! += lab[c]!
    count++
  }
  const out = new Uint8ClampedArray(rgba.length)
  out.set(Array.from(rgba))
  if (count === 0) return out
  for (let c = 0; c < 3; c++) mean[c]! /= count
  const target = rgbToOklab(...hexToRgb(targetHex))
  for (let i = 0; i < pixels; i++) {
    const lab = labs[i]
    if (!lab) continue
    const [r, g, b] = oklabToRgb([
      Math.max(0, Math.min(1, target[0] + (lab[0] - mean[0]) * options.contrast)),
      target[1] + (lab[1] - mean[1]) * options.colorDetail,
      target[2] + (lab[2] - mean[2]) * options.colorDetail
    ])
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
  }
  return out
}

/** Mean color of the opaque pixels (averaged in OKLab), as hex; null for a transparent image. */
export function meanColorHex(rgba: ArrayLike<number>): string | null {
  const mean: Lab = [0, 0, 0]
  let count = 0
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! === 0) continue
    const lab = rgbToOklab(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!)
    for (let c = 0; c < 3; c++) mean[c]! += lab[c]!
    count++
  }
  if (count === 0) return null
  const rgb = oklabToRgb([mean[0] / count, mean[1] / count, mean[2] / count])
  return rgb.map((v) => v.toString(16).padStart(2, '0')).join('')
}

/** Nearest-neighbour copy no larger than `maxSide` (previews of big textures stay fast). */
export function previewSample(
  image: { width: number; height: number; data: ArrayLike<number> },
  maxSide: number
): { width: number; height: number; data: Uint8ClampedArray } {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sy = Math.min(image.height - 1, Math.floor(y / scale))
    for (let x = 0; x < width; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x / scale))
      const from = (sy * image.width + sx) * 4
      for (let c = 0; c < 4; c++) data[(y * width + x) * 4 + c] = image.data[from + c]!
    }
  }
  return { width, height, data }
}
