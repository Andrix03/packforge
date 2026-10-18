// Batch application of a material preset (`_s`) and/or the relief generator (`_n`) to many
// textures. Pure: builds the map bytes from the albedo (and the existing map), and plans which
// files are created, overwritten or skipped. Existing maps are only overwritten when asked.

import { applyMaterial, type MaterialOptions } from './materialPresets'
import {
  heightFromAlbedo,
  normalsFromHeight,
  occlusionFromHeight,
  type HeightOptions,
  type MapGrid,
  type NormalOptions,
  type OcclusionOptions
} from './pbrGenerator'
import { f0Byte } from './materialPresets'
import type { MapKind } from './labpbr'

/** Texel of a map nobody has painted yet: flat, unoccluded; 4% dielectric, no emission. */
export const NEUTRAL_TEXEL: Record<MapKind, readonly number[]> = {
  normal: [128, 128, 255, 255],
  specular: [0, f0Byte(1.5), 0, 255]
}

export function neutralMap(kind: MapKind, width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data.set(NEUTRAL_TEXEL[kind], i)
  return data
}

/** `_s` bytes: the preset over the existing map (or a neutral one); emission kept unless emissive. */
export function buildSpecular(
  albedo: ArrayLike<number>,
  width: number,
  height: number,
  existing: ArrayLike<number> | null,
  options: MaterialOptions
): Uint8ClampedArray {
  return applyMaterial(albedo, existing ?? neutralMap('specular', width, height), options)
}

export interface ReliefOptions {
  height: HeightOptions
  normals: NormalOptions
  /** null = AO left as it was (255 on a new map). */
  occlusion: OcclusionOptions | null
}

/** `_n` bytes: height from the colors, normals and AO from the height (as "Genera tutto"). */
export function buildNormal(
  albedo: ArrayLike<number>,
  grid: MapGrid,
  existing: ArrayLike<number> | null,
  options: ReliefOptions
): Uint8ClampedArray {
  const heights = heightFromAlbedo(albedo, grid, options.height)
  const rg = normalsFromHeight(heights, grid, options.normals)
  const ao = options.occlusion ? occlusionFromHeight(heights, grid, options.occlusion) : null
  const out = new Uint8ClampedArray(grid.width * grid.height * 4)
  for (let i = 0; i < heights.length; i++) {
    out[i * 4] = rg[i * 2]!
    out[i * 4 + 1] = rg[i * 2 + 1]!
    out[i * 4 + 2] = ao ? ao[i]! : (existing?.[i * 4 + 2] ?? 255)
    out[i * 4 + 3] = heights[i]!
  }
  return out
}

export type BatchAction = 'create' | 'overwrite' | 'skip'

export interface BatchTexture {
  /** Pack path of the albedo PNG. */
  albedo: string
  hasNormal: boolean
  hasSpecular: boolean
}

export interface BatchPlanEntry {
  albedo: string
  normal: BatchAction | null
  specular: BatchAction | null
}

export interface BatchChoice {
  specular: boolean
  normal: boolean
  overwrite: boolean
}

/** What happens to each texture's maps (null = that map is not part of the batch). */
export function planBatch(
  textures: readonly BatchTexture[],
  choice: BatchChoice
): BatchPlanEntry[] {
  const action = (exists: boolean): BatchAction =>
    !exists ? 'create' : choice.overwrite ? 'overwrite' : 'skip'
  return textures.map((texture) => ({
    albedo: texture.albedo,
    normal: choice.normal ? action(texture.hasNormal) : null,
    specular: choice.specular ? action(texture.hasSpecular) : null
  }))
}

export interface BatchCounts {
  create: number
  overwrite: number
  skip: number
}

export function countPlan(plan: readonly BatchPlanEntry[]): BatchCounts {
  const counts: BatchCounts = { create: 0, overwrite: 0, skip: 0 }
  for (const entry of plan) {
    for (const action of [entry.normal, entry.specular]) if (action) counts[action]++
  }
  return counts
}
