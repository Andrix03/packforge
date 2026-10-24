// "Variant by name" (Phase 14): an item renamed in an anvil (e.g. "Excalibur") draws another
// texture, with vanilla item definitions only (the replacement for OptiFine CIT). The definition
// becomes a select on the `minecraft:custom_name` component, the item's previous definition as
// fallback (kept as written); the variant gets its own model (a copy of the item's model with the
// new texture) and texture. Pure.
import { namespaced } from './blockModel'

export interface NameVariantPlan {
  name: string
  /** `minecraft:item/diamond_sword_excalibur` (model and texture share the id). */
  id: string
  texturePath: string
  modelPath: string
}

/** File-safe form of a name: `Excalibur II` → `excalibur_ii` (null when nothing is left). */
export function variantSlug(name: string): string | null {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '')
  return slug === '' ? null : slug
}

/** The files of the variant of item `item` (`minecraft:diamond_sword`) for an anvil name. */
export function nameVariantPlan(item: string, name: string): NameVariantPlan | null {
  const slug = variantSlug(name)
  const trimmed = name.trim()
  if (!slug || trimmed === '') return null
  const [ns, path] = namespaced(item).split(':') as [string, string]
  return {
    name: trimmed,
    id: `${ns}:item/${path}_${slug}`,
    texturePath: `assets/${ns}/textures/item/${path}_${slug}.png`,
    modelPath: `assets/${ns}/models/item/${path}_${slug}.json`
  }
}

/**
 * The variant's model: the item's own model (parent, display…) with every use of its texture
 * swapped for the variant's. Without a readable model: a flat item.
 */
export function variantModel(
  baseModel: unknown,
  baseTexture: string,
  variantTexture: string
): Record<string, unknown> {
  if (!isRecord(baseModel)) {
    return { parent: 'minecraft:item/generated', textures: { layer0: variantTexture } }
  }
  const textures = isRecord(baseModel['textures']) ? baseModel['textures'] : {}
  const swapped = Object.fromEntries(
    Object.entries(textures).map(([key, value]) => [
      key,
      typeof value === 'string' && namespaced(value) === namespaced(baseTexture)
        ? variantTexture
        : value
    ])
  )
  return { ...baseModel, textures: swapped }
}

const PROPERTY = 'minecraft:component'
const COMPONENT = 'minecraft:custom_name'

/** True when the definition's root is already a select on the custom name. */
function isNameSelect(node: unknown): node is Record<string, unknown> & { cases?: unknown } {
  return (
    isRecord(node) &&
    namespaced(String(node['type'])) === 'minecraft:select' &&
    namespaced(String(node['property'])) === PROPERTY &&
    namespaced(String(node['component'])) === COMPONENT
  )
}

/**
 * The definition with `name` drawing `variantModel`: its root wrapped in a select on the custom
 * name (the old root as fallback), or the case added to / replaced in that select when it exists.
 * `definition` null (no definition yet): the item's plain model `fallbackModel` is the fallback.
 */
export function withNameCase(
  definition: unknown,
  name: string,
  variant: string,
  fallbackModel: string
): Record<string, unknown> {
  const root = isRecord(definition) ? definition : {}
  const current: unknown = root['model'] ?? { type: 'minecraft:model', model: fallbackModel }
  const entry = { when: name, model: { type: 'minecraft:model', model: variant } }
  if (isNameSelect(current)) {
    const cases = (Array.isArray(current.cases) ? current.cases : []).filter(
      (c: unknown) => !(isRecord(c) && c['when'] === name)
    )
    return { ...root, model: { ...current, cases: [...cases, entry] } }
  }
  return {
    ...root,
    model: {
      type: 'minecraft:select',
      property: PROPERTY,
      component: COMPONENT,
      cases: [entry],
      fallback: current
    }
  }
}

/** The names already given a variant in the definition. */
export function namedVariants(definition: unknown): Array<{ name: string; model: string }> {
  const current = isRecord(definition) ? definition['model'] : null
  if (!isNameSelect(current) || !Array.isArray(current.cases)) return []
  return current.cases.flatMap((c: unknown) => {
    if (!isRecord(c) || typeof c['when'] !== 'string' || !isRecord(c['model'])) return []
    const model = c['model']['model']
    return typeof model === 'string' ? [{ name: c['when'], model }] : []
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 25w03a (1.21.5, format 55 as a release): the `component` select property. */
export const NAME_SELECT_SINCE = { major: 55, minor: 0 } as const
