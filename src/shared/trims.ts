// Armor trims for the armor preview: the pattern textures (`trims/entity/<layer>/<pattern>.png`,
// grey shades of the base palette), the material palettes (8×1) and the base palette they are
// matched against. 26.3 moved the palettes to `textures/palettes/` (`trim_base.png`,
// `trim/<material>.png`); older packs use `textures/trims/color_palettes/` (`trim_palette.png`).
// A trim on armor of its own material uses the `_darker` palette (vanilla `override_armor_assets`).
// Checked on the 26.3 client jar. Pure.
import type { ArmorLayer } from './armorModel'

const PATTERN =
  /^assets\/([^/]+)\/textures\/trims\/entity\/(humanoid|humanoid_leggings)\/([^/]+)\.png$/
const NEW_PALETTE = /^assets\/([^/]+)\/textures\/palettes\/trim\/([^/]+)\.png$/
const OLD_PALETTE = /^assets\/([^/]+)\/textures\/trims\/color_palettes\/([^/]+)\.png$/
const ARMOR =
  /^assets\/([^/]+)\/textures\/entity\/equipment\/(humanoid|humanoid_leggings)\/([^/]+)\.png$/

export const BASE_PALETTES = [
  'assets/minecraft/textures/palettes/trim_base.png',
  'assets/minecraft/textures/trims/color_palettes/trim_palette.png'
] as const

/** The layer and name of a trim pattern texture, or null. */
export function trimPatternOf(path: string): { layer: ArmorLayer; name: string } | null {
  const m = PATTERN.exec(path)
  return m ? { layer: m[2] as ArmorLayer, name: m[3]! } : null
}

/** The material name of a trim palette texture (not the base palette), or null. */
export function trimMaterialOf(path: string): string | null {
  const m = NEW_PALETTE.exec(path) ?? OLD_PALETTE.exec(path)
  if (!m || m[2] === 'trim_palette') return null
  return m[2]!
}

export interface TrimChoices {
  /** Pattern name → texture path, for the layer. */
  patterns: Map<string, string>
  /** Material name → palette path (`_darker` ones not listed; see `trimPalette`). */
  materials: Map<string, string>
  /** Armor material name → texture path, for the layer. */
  armors: Map<string, string>
  /** All palettes by name, `_darker` included. */
  palettes: Map<string, string>
}

/**
 * What can be combined on a layer from a set of files (pack and vanilla merged by the caller,
 * pack first: the first path seen for a name wins). New palettes win over old ones.
 */
export function trimChoices(files: Iterable<string>, layer: ArmorLayer): TrimChoices {
  const patterns = new Map<string, string>()
  const palettes = new Map<string, string>()
  const oldPalettes = new Map<string, string>()
  const armors = new Map<string, string>()
  for (const path of files) {
    const pattern = PATTERN.exec(path)
    if (pattern && pattern[2] === layer && !patterns.has(pattern[3]!)) {
      patterns.set(pattern[3]!, path)
    }
    const armor = ARMOR.exec(path)
    if (armor && armor[2] === layer && !armors.has(armor[3]!)) armors.set(armor[3]!, path)
    const material = trimMaterialOf(path)
    if (material) {
      const target = NEW_PALETTE.test(path) ? palettes : oldPalettes
      if (!target.has(material)) target.set(material, path)
    }
  }
  for (const [name, path] of oldPalettes) if (!palettes.has(name)) palettes.set(name, path)
  const materials = new Map(
    [...palettes]
      .filter(([name]) => !name.endsWith('_darker'))
      .sort(([a], [b]) => a.localeCompare(b))
  )
  return {
    patterns: new Map([...patterns].sort(([a], [b]) => a.localeCompare(b))),
    materials,
    armors: new Map([...armors].sort(([a], [b]) => a.localeCompare(b))),
    palettes
  }
}

/** The palette a material's trim uses on an armor: `<material>_darker` on armor of that material. */
export function trimPalette(
  palettes: ReadonlyMap<string, string>,
  material: string,
  armor: string | null
): string | null {
  // Vanilla armor names: `gold` armor ↔ `gold` material, `iron`, `diamond`, `netherite`, `copper`.
  if (armor === material) {
    const darker = palettes.get(`${material}_darker`)
    if (darker) return darker
  }
  return palettes.get(material) ?? null
}

/** The name of an armor texture's material (`…/humanoid/iron.png` → `iron`), or null. */
export function armorMaterialOf(path: string): string | null {
  return ARMOR.exec(path)?.[3] ?? null
}

/** What the armor preview shows a texture as: armor, a trim pattern, a trim palette, or null. */
export type ArmorPreviewRole = 'armor' | 'pattern' | 'palette'

export function armorPreviewRole(path: string): ArmorPreviewRole | null {
  if (ARMOR.test(path)) return 'armor'
  if (PATTERN.test(path)) return 'pattern'
  return trimMaterialOf(path) ? 'palette' : null
}
