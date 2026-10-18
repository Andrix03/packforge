// Material presets for the LabPBR `_s` map: smoothness (R), F0 / metal (G), porosity / SSS (B)
// and, for emissive blocks, emission (A) from the albedo. Pure, works on plain byte arrays.
//
// The spec (shaderlabs.org, LabPBR 1.3) fixes the encoding but gives no per-material table: the
// only values it names are porosity sand 64, wool 38, wood 12, metals 0, and the predefined metals
// 230–237. Dielectric F0 comes from the refractive index, ((n−1)/(n+1))² (water 2%, glass 4%,
// diamond 17%). Smoothness values are our own starting points: the UI says so.

import { METALS } from './labpbr'

/** Stored `_s` bytes of a material (emission is not part of it: only the emissive preset writes A). */
export interface MaterialValues {
  smoothness: number
  /** 0–229 F0, 230–237 predefined metal, 255 albedo metal. */
  f0: number
  /** 0–64 porosity, 65–255 subsurface scattering. */
  porosity: number
}

/** F0 byte of a dielectric with refractive index n (linear, as the spec). */
export function f0Byte(n: number): number {
  return Math.round(((n - 1) / (n + 1)) ** 2 * 255)
}

const COMMON_F0 = f0Byte(1.5)

export type MaterialId =
  | 'stone'
  | 'polished'
  | 'wood'
  | 'soil'
  | 'wool'
  | 'leaves'
  | 'glass'
  | 'ice'
  | 'metal'
  | 'ore'
  | 'emissive'

export interface MaterialPreset {
  id: MaterialId
  label: string
  hint: string
  values: MaterialValues
  /** Default for how much the smoothness follows the albedo's lightness (0–1). */
  variation: number
}

export const MATERIALS: readonly MaterialPreset[] = [
  {
    id: 'stone',
    label: 'Pietra',
    hint: 'Pietra grezza, ciottoli, mattoni: ruvida, poco porosa',
    values: { smoothness: 50, f0: COMMON_F0, porosity: 24 },
    variation: 0.5
  },
  {
    id: 'polished',
    label: 'Pietra levigata',
    hint: 'Pietre lucidate, quarzo, calcestruzzo liscio: riflessi morbidi',
    values: { smoothness: 170, f0: COMMON_F0, porosity: 4 },
    variation: 0.3
  },
  {
    id: 'wood',
    label: 'Legno',
    hint: 'Assi e tronchi: opaco, porosità del legno secondo la specifica (12)',
    values: { smoothness: 70, f0: COMMON_F0, porosity: 12 },
    variation: 0.5
  },
  {
    id: 'soil',
    label: 'Terra, sabbia',
    hint: 'Terra, sabbia, ghiaia: molto ruvida, porosità massima (si scurisce con la pioggia)',
    values: { smoothness: 20, f0: COMMON_F0, porosity: 64 },
    variation: 0.3
  },
  {
    id: 'wool',
    label: 'Lana, tessuto',
    hint: 'Lana e tappeti: ruvida, porosità della lana secondo la specifica (38)',
    values: { smoothness: 15, f0: COMMON_F0, porosity: 38 },
    variation: 0.2
  },
  {
    id: 'leaves',
    label: 'Foglie, erba',
    hint: 'La luce passa attraverso (SSS 50%): foglie, erba, piante',
    values: { smoothness: 90, f0: COMMON_F0, porosity: 160 },
    variation: 0.3
  },
  {
    id: 'glass',
    label: 'Vetro',
    hint: 'Liscio come uno specchio, riflette il 4% (indice 1,5)',
    values: { smoothness: 245, f0: COMMON_F0, porosity: 0 },
    variation: 0
  },
  {
    id: 'ice',
    label: 'Ghiaccio',
    hint: 'Molto liscio, riflette il 2% (indice 1,31)',
    values: { smoothness: 235, f0: f0Byte(1.31), porosity: 0 },
    variation: 0.1
  },
  {
    id: 'metal',
    label: 'Metallo',
    hint: 'Blocchi di metallo: scegli quale (il colore della texture tinge i riflessi)',
    values: { smoothness: 190, f0: 230, porosity: 0 },
    variation: 0.3
  },
  {
    id: 'ore',
    label: 'Minerale',
    hint: 'Pietra con gemme o metallo: i pixel colorati diventano la gemma, il resto pietra',
    values: { smoothness: 50, f0: COMMON_F0, porosity: 24 },
    variation: 0.5
  },
  {
    id: 'emissive',
    label: 'Luminoso',
    hint: 'Pietra luminosa, lanterne, lampade: i pixel chiari emettono luce',
    values: { smoothness: 60, f0: COMMON_F0, porosity: 0 },
    variation: 0.3
  }
]

export function materialPreset(id: MaterialId): MaterialPreset {
  return MATERIALS.find((preset) => preset.id === id)!
}

export interface Gem {
  id: string
  label: string
  values: MaterialValues
}

/** What the colored pixels of an ore become. */
export const GEMS: readonly Gem[] = [
  { id: 'diamond', label: 'Diamante', values: { smoothness: 225, f0: f0Byte(2.42), porosity: 0 } },
  { id: 'emerald', label: 'Smeraldo', values: { smoothness: 220, f0: f0Byte(1.58), porosity: 0 } },
  { id: 'quartz', label: 'Quarzo', values: { smoothness: 200, f0: f0Byte(1.54), porosity: 0 } },
  {
    id: 'lapis',
    label: 'Lapislazzuli',
    values: { smoothness: 140, f0: f0Byte(1.5), porosity: 0 }
  },
  { id: 'redstone', label: 'Redstone', values: { smoothness: 110, f0: f0Byte(1.5), porosity: 8 } },
  { id: 'coal', label: 'Carbone', values: { smoothness: 70, f0: f0Byte(1.5), porosity: 8 } },
  { id: 'iron', label: 'Ferro', values: { smoothness: 150, f0: 230, porosity: 0 } },
  { id: 'gold', label: 'Oro', values: { smoothness: 180, f0: 231, porosity: 0 } },
  { id: 'copper', label: 'Rame', values: { smoothness: 160, f0: 234, porosity: 0 } }
]

/** Metals for the metal preset: the predefined ones, then "the albedo is the reflection". */
export const METAL_CHOICES: ReadonlyArray<{ value: number; label: string }> = [
  ...METALS.map((metal) => ({ value: metal.value, label: metal.label })),
  { value: 255, label: 'Dal colore della texture' }
]

export interface MaterialOptions {
  preset: MaterialId
  /** Green byte of the metal preset. */
  metal: number
  /** Gem id of the ore preset. */
  gem: string
  /** 0–1: smoothness follows the albedo's lightness (darker = rougher), up to ±64. */
  variation: number
  /** 0–1: how different from the stone a pixel must be to count as gem (ore preset). */
  accentThreshold: number
  /** 0–1: lightness from which a pixel glows (emissive preset). */
  glowThreshold: number
}

export const DEFAULT_MATERIAL: MaterialOptions = {
  preset: 'stone',
  metal: 230,
  gem: 'diamond',
  variation: 0.5,
  accentThreshold: 0.2,
  glowThreshold: 0.55
}

/** Largest smoothness shift the lightness can cause (at variation 1). */
const MAX_VARIATION = 64

function lumaAt(albedo: ArrayLike<number>, i: number): number {
  return (0.2126 * albedo[i * 4]! + 0.7152 * albedo[i * 4 + 1]! + 0.0722 * albedo[i * 4 + 2]!) / 255
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

/** Weights of the accent score: a different hue counts more than a lighter or darker shade. */
const CHROMA_WEIGHT = 2
const LIGHTNESS_WEIGHT = 1

/**
 * How far each pixel is from the texture's typical color (per-channel median of the opaque
 * pixels): the hue/saturation difference, or the lightness difference (coal's black spots).
 */
export function accentScores(albedo: ArrayLike<number>, pixels: number): Float32Array {
  const channels: number[][] = [[], [], []]
  for (let i = 0; i < pixels; i++) {
    if (albedo[i * 4 + 3]! === 0) continue
    for (let c = 0; c < 3; c++) channels[c]!.push(albedo[i * 4 + c]!)
  }
  const typical = channels.map(median)
  const out = new Float32Array(pixels)
  for (let i = 0; i < pixels; i++) {
    if (albedo[i * 4 + 3]! === 0) continue
    const d = [0, 1, 2].map((c) => (albedo[i * 4 + c]! - typical[c]!) / 255)
    const lightness = 0.2126 * d[0]! + 0.7152 * d[1]! + 0.0722 * d[2]!
    const chroma = Math.hypot(d[0]! - lightness, d[1]! - lightness, d[2]! - lightness)
    out[i] = Math.max(chroma * CHROMA_WEIGHT, Math.abs(lightness) * LIGHTNESS_WEIGHT)
  }
  return out
}

/** Pixels of an ore that are not stone (score above `threshold`). 1 = gem; transparent never. */
export function accentMask(
  albedo: ArrayLike<number>,
  pixels: number,
  threshold: number
): Uint8Array {
  const scores = accentScores(albedo, pixels)
  const out = new Uint8Array(pixels)
  for (let i = 0; i < pixels; i++) if (scores[i]! > threshold) out[i] = 1
  return out
}

/** Emission 0–254 from the lightness (0 below the threshold, half to full above it). */
export function glowOf(luma: number, threshold: number): number {
  if (luma < threshold) return 0
  const t = threshold >= 1 ? 1 : (luma - threshold) / (1 - threshold)
  return Math.round(127 + 127 * t)
}

/**
 * New `_s` bytes: `current` with the material written into R, G, B (and A for the emissive
 * preset) of every opaque-ish albedo pixel inside `mask` (null = everywhere). `albedo` and
 * `current` are RGBA of the same size; other pixels and bytes are copied unchanged.
 */
export function applyMaterial(
  albedo: ArrayLike<number>,
  current: ArrayLike<number>,
  options: MaterialOptions,
  mask: Uint8Array | null = null
): Uint8ClampedArray {
  const pixels = current.length / 4
  const out = new Uint8ClampedArray(current)
  const preset = materialPreset(options.preset)
  const base: MaterialValues =
    preset.id === 'metal' ? { ...preset.values, f0: options.metal } : preset.values
  const gem = GEMS.find((g) => g.id === options.gem) ?? GEMS[0]!
  const accents = preset.id === 'ore' ? accentMask(albedo, pixels, options.accentThreshold) : null
  const valuesAt = (i: number): MaterialValues => (accents?.[i] ? gem.values : base)

  // Variation is relative to the mean lightness of the pixels of the same material.
  const sums = [0, 0]
  const counts = [0, 0]
  const targets: number[] = []
  for (let i = 0; i < pixels; i++) {
    if (albedo[i * 4 + 3]! === 0 || (mask && !mask[i])) continue
    targets.push(i)
    const group = accents?.[i] ?? 0
    sums[group]! += lumaAt(albedo, i)
    counts[group]! += 1
  }
  const means = [sums[0]! / (counts[0] || 1), sums[1]! / (counts[1] || 1)]

  for (const i of targets) {
    const values = valuesAt(i)
    const shift = (lumaAt(albedo, i) - means[accents?.[i] ?? 0]!) * 2 * options.variation
    out[i * 4] = Math.round(values.smoothness + shift * MAX_VARIATION)
    out[i * 4 + 1] = values.f0
    out[i * 4 + 2] = values.porosity
    if (preset.id === 'emissive') {
      const glow = glowOf(lumaAt(albedo, i), options.glowThreshold)
      out[i * 4 + 3] = glow === 0 ? 255 : glow
    }
  }
  return out
}
