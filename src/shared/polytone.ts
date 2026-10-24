// Polytone (Fabric / NeoForge mod) biome colours: a pack's own colormap PNG in
// `assets/<ns>/polytone/colormaps/<name>.png`, used by blocks through
// `assets/<ns>/polytone/block_modifiers/<block>.json` = `{"colormap": "<ns>:<name>"}`. With no
// `.json` beside the PNG, Polytone samples it like vanilla grass (temperature × downfall), so
// PackForge writes none. Source: github.com/MehVahdJukaar/polytone/wiki/Colormaps (2026-10-24).
// The starting map is generated from three colours, never copied from the game. Pure.
import { tr } from './i18n'

export interface PolytoneGroup {
  id: string
  label: string
  /** Vanilla blocks whose models have a tinted face (tintindex 0). */
  blocks: string[]
}

export const POLYTONE_GROUPS: readonly PolytoneGroup[] = [
  {
    id: 'leaves',
    label: tr('Foglie (anche abete e betulla, che in vanilla hanno un colore fisso)'),
    blocks: [
      'oak_leaves',
      'jungle_leaves',
      'acacia_leaves',
      'dark_oak_leaves',
      'mangrove_leaves',
      'spruce_leaves',
      'birch_leaves',
      'vine'
    ]
  },
  {
    id: 'grass',
    label: tr('Erba, felci e canne da zucchero'),
    blocks: ['grass_block', 'short_grass', 'tall_grass', 'fern', 'large_fern', 'sugar_cane']
  }
]

const NAME = /^[a-z0-9_-]{1,40}$/

/** A valid colormap name (lowercase letters, digits, `_`, `-`) or an Italian error. */
export function polytoneNameProblem(name: string): string | null {
  return NAME.test(name) ? null : tr('Usa lettere minuscole, cifre, _ e - (massimo 40).')
}

export function polytoneColormapPath(name: string, ns = 'minecraft'): string {
  return `assets/${ns}/polytone/colormaps/${name}.png`
}

export function polytoneModifierPath(block: string, ns = 'minecraft'): string {
  return `assets/${ns}/polytone/block_modifiers/${block}.json`
}

export function polytoneModifier(name: string, ns = 'minecraft'): Record<string, unknown> {
  return { colormap: `${ns}:${name}` }
}

/** True for a Polytone colormap PNG (`polytone/colormaps/*.png`). */
export function isPolytoneColormap(path: string): boolean {
  return /^assets\/[^/]+\/polytone\/colormaps\/[a-z0-9_/-]+\.png$/.test(path)
}

type Rgb = [number, number, number]

/**
 * A 256×256 colormap laid out like vanilla's: temperature falls from left to right, downfall
 * grows upwards within the used lower-left triangle. `hot` at the hot dry corner, `cold` at the
 * cold side, `wet` where it is hot and rainy; the unused half repeats its edge.
 */
export function generateColormap(hot: Rgb, cold: Rgb, wet: Rgb): Uint8ClampedArray {
  const out = new Uint8ClampedArray(256 * 256 * 4)
  const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ]
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const temperature = 1 - x / 255
      // Vanilla scales downfall by temperature: the point is (1 - t, 1 - d·t).
      const scaled = 1 - y / 255
      const downfall = temperature > 0 ? Math.min(1, scaled / temperature) : 0
      const color = mix(mix(cold, hot, temperature), wet, downfall * temperature)
      const at = (y * 256 + x) * 4
      out[at] = Math.round(color[0])
      out[at + 1] = Math.round(color[1])
      out[at + 2] = Math.round(color[2])
      out[at + 3] = 255
    }
  }
  return out
}

/** A Polytone JSON a pack may hold: block modifiers and colormap definitions. */
export function isPolytoneJsonPath(path: string): boolean {
  return /^assets\/[a-z0-9_.-]+\/polytone\/(block_modifiers|colormaps)\/[a-z0-9_./-]+\.json$/.test(
    path
  )
}
