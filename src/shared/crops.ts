// Crops and other blocks that grow through an `age` state (wheat, carrots, stems, berries…).
// Each age is a block state variant whose model points at that stage's texture
// (`wheat_stage0` … `wheat_stage7`); several ages may share one texture (carrots: 8 ages, 4
// textures). Stem colors: https://minecraft.wiki/w/Block_colors (verified 2026-10-19).

import type { BlockstateVariant } from './blockModel'
import type { Rgb } from './biomeTint'

/** Value of a state in a variant key (`age=3,facing=north` → age: "3"), or null. */
export function stateValue(variantKey: string, state: string): string | null {
  for (const part of variantKey.split(',')) {
    const [name, value] = part.split('=')
    if (name === state && value !== undefined) return value
  }
  return null
}

/**
 * The growth stages of a block: its variants with an `age`, sorted by age. Variants that also
 * differ in other states (cocoa's facing, the pitcher's half) keep only those matching `base`,
 * so the stages are one plant growing. Empty when the block does not grow.
 */
export function growthVariants(
  variants: readonly BlockstateVariant[],
  base: BlockstateVariant | null
): BlockstateVariant[] {
  const others = (key: string): string =>
    key
      .split(',')
      .filter((part) => !part.startsWith('age='))
      .join(',')
  const reference = base && stateValue(base.key, 'age') !== null ? others(base.key) : null
  const aged = variants.filter((v) => stateValue(v.key, 'age') !== null)
  const sameRest = reference === null ? aged : aged.filter((v) => others(v.key) === reference)
  // Without a base: the first combination of the other states.
  const chosen =
    reference === null && sameRest.length > 0
      ? sameRest.filter((v) => others(v.key) === others(sameRest[0]!.key))
      : sameRest
  return chosen.length > 1 ? [...chosen].sort((a, b) => age(a) - age(b)) : []
}

function age(variant: BlockstateVariant): number {
  return Number(stateValue(variant.key, 'age'))
}

const STEMS = new Set(['pumpkin_stem', 'melon_stem'])

/**
 * Tint of pumpkin and melon stems at an age (0–7): green when young, yellow when grown —
 * the game computes r = 32·age, g = 255 − 8·age, b = 4·age. Null for other blocks.
 */
export function stemTint(block: string, variantKey: string): Rgb | null {
  if (!STEMS.has(block)) return null
  const value = Number(stateValue(variantKey, 'age') ?? 0)
  const a = Math.min(7, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0))
  return [(32 * a) / 255, (255 - 8 * a) / 255, (4 * a) / 255]
}

/**
 * Names a stage texture may belong to, most likely first: `wheat_stage3` → `wheat`,
 * `pitcher_crop_bottom_stage_2` → `pitcher_crop_bottom`, `pitcher_crop`.
 */
export function stageBaseNames(textureName: string): string[] {
  const base = textureName.replace(/_stage_?\d+$/, '')
  if (base === textureName) return []
  const names = [base, base.replace(/_(top|bottom)$/, '')]
  return [...new Set(names)]
}
