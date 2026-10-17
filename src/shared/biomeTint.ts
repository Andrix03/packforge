// Biome tint for faces with a tintindex (Java Edition).
// Sources (verified 2026-10-18): https://minecraft.wiki/w/Biome (colormap
// sampling, biome temperature/downfall, special colors, fixed spruce/birch
// colors) and https://minecraft.wiki/w/Color (which blocks use which colormap).
// Only biomes whose values the wiki states unambiguously are listed.

export type Rgb = [number, number, number]
export type Colormap = 'grass' | 'foliage' | 'dry_foliage'

export interface Biome {
  id: string
  label: string
  temperature: number
  downfall: number
  /** Fixed colors overriding the colormaps in this biome. */
  overrides?: Partial<Record<Colormap, string>>
}

export const BIOMES: readonly Biome[] = [
  { id: 'plains', label: 'Pianure', temperature: 0.8, downfall: 0.4 },
  { id: 'forest', label: 'Foresta', temperature: 0.7, downfall: 0.8 },
  { id: 'birch_forest', label: 'Foresta di betulle', temperature: 0.6, downfall: 0.6 },
  { id: 'jungle', label: 'Giungla', temperature: 0.95, downfall: 0.9 },
  {
    id: 'badlands',
    label: 'Badlands',
    temperature: 2.0,
    downfall: 0.0,
    overrides: { grass: '#90814d', foliage: '#9e814d', dry_foliage: '#9e814d' }
  },
  {
    id: 'cherry_grove',
    label: 'Ciliegeto',
    temperature: 0.5,
    downfall: 0.8,
    overrides: { grass: '#b6db61', foliage: '#b6db61' }
  }
]

export const DEFAULT_BIOME = BIOMES[0] as Biome

export type TintSource = { kind: 'colormap'; colormap: Colormap } | { kind: 'fixed'; color: string }

const GRASS_BLOCKS = new Set([
  'grass_block',
  'short_grass',
  'tall_grass',
  'fern',
  'large_fern',
  'bush',
  'potted_fern',
  'sugar_cane',
  'pink_petals',
  'wildflowers'
])
const FOLIAGE_BLOCKS = new Set([
  'oak_leaves',
  'jungle_leaves',
  'acacia_leaves',
  'dark_oak_leaves',
  'mangrove_leaves',
  'vine'
])
const FIXED_COLORS: Record<string, string> = {
  spruce_leaves: '#619961',
  birch_leaves: '#80a755'
}

/** How a block's tinted faces are colored, or null when PackForge doesn't simulate it. */
export function tintSourceForBlock(block: string): TintSource | null {
  if (GRASS_BLOCKS.has(block)) return { kind: 'colormap', colormap: 'grass' }
  if (FOLIAGE_BLOCKS.has(block)) return { kind: 'colormap', colormap: 'foliage' }
  if (block === 'leaf_litter') return { kind: 'colormap', colormap: 'dry_foliage' }
  const fixed = FIXED_COLORS[block]
  return fixed ? { kind: 'fixed', color: fixed } : null
}

/**
 * Pixel of a 256×256 colormap for a biome. The bottom-right corner is
 * temperature 0 / downfall 0; temperature grows to the left, downfall
 * upwards, and only the lower-left half is used (downfall scaled by
 * temperature). Out-of-range values use the nearest edge.
 */
export function colormapPixel(temperature: number, downfall: number): { x: number; y: number } {
  const t = clamp01(temperature)
  const d = clamp01(downfall) * t
  return { x: Math.floor((1 - t) * 255), y: Math.floor((1 - d) * 255) }
}

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
