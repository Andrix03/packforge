// "2D in the inventory, 3D in hand" (Phase 14): an item keeps its flat sprite in the GUI, on the
// ground and in frames, and is drawn as the extruded 3D model (shared/extrude.ts) everywhere else,
// through its item definition (`items/<name>.json`, 1.21.4+) — the way vanilla does the spyglass
// and the trident (26.3 client data). Pure.
import { tr } from './i18n'
import { ITEM_FEATURES, parseItemDefinition } from './itemDefinition'
import { MODEL_FEATURES, type FormatRange } from './modelRules'
import { comparePackVersions } from './packFormat'

export interface Item3dPlan {
  /** `minecraft:item/apple`: the flat model and the texture id. */
  flatModel: string
  /** `minecraft:item/apple_3d`. */
  model3d: string
  model3dPath: string
  definitionPath: string
}

/** For an item texture (`assets/<ns>/textures/item/<path>.png`), the files involved; else null. */
export function item3dPlan(texturePath: string): Item3dPlan | null {
  const m = /^assets\/([a-z0-9_.-]+)\/textures\/item\/([a-z0-9_./-]+)\.png$/.exec(texturePath)
  if (!m) return null
  const [, ns, path] = m as unknown as [string, string, string]
  // The definition is named after the item: only top-level item textures have one.
  if (path.includes('/')) return null
  return {
    flatModel: `${ns}:item/${path}`,
    model3d: `${ns}:item/${path}_3d`,
    model3dPath: `assets/${ns}/models/item/${path}_3d.json`,
    definitionPath: `assets/${ns}/items/${path}.json`
  }
}

export type Item3dCheck = { ok: true; tints: unknown[] } | { ok: false; error: string }

/**
 * Whether the item's current definition (the pack's, else vanilla's; null if none) can be split:
 * only a plain model drawing the flat one (tints are kept). Items that change with their state
 * (bow, compass, trims…) would lose that.
 */
export function canSplit(definition: unknown, plan: Item3dPlan, range: FormatRange): Item3dCheck {
  if (comparePackVersions(range.min, ITEM_FEATURES.definitions) < 0) {
    return {
      ok: false,
      error: tr('Serve la 1.21.4 o successiva: le versioni prima non leggono la cartella items/.')
    }
  }
  if (definition === null) return { ok: true, tints: [] }
  const { root } = parseItemDefinition(definition, range)
  if (root?.type === 'model' && sameId(root.model, plan.flatModel)) {
    return { ok: true, tints: root.tints }
  }
  if (root?.type === 'select' && sameId(firstModel(root.fallback), plan.model3d)) {
    return { ok: false, error: tr('Questo oggetto è già 3D in mano.') }
  }
  return {
    ok: false,
    error: tr(
      'Questo oggetto cambia aspetto con il suo stato (arco, bussola, rifiniture…): per ora solo gli oggetti con un solo modello.'
    )
  }
}

/**
 * The definition: the flat model in the GUI, on the ground, in item frames (and on shelves where
 * every targeted version knows them: older ones would refuse the file), the 3D one elsewhere.
 */
export function splitDefinition(
  plan: Item3dPlan,
  tints: unknown[],
  range: FormatRange
): Record<string, unknown> {
  const model = (id: string): Record<string, unknown> => ({
    type: 'minecraft:model',
    model: id,
    ...(tints.length > 0 ? { tints } : {})
  })
  const flat = ['gui', 'ground', 'fixed']
  if (comparePackVersions(range.min, MODEL_FEATURES.onShelf) >= 0) flat.push('on_shelf')
  return {
    model: {
      type: 'minecraft:select',
      property: 'minecraft:display_context',
      cases: [{ when: flat, model: model(plan.flatModel) }],
      fallback: model(plan.model3d)
    }
  }
}

function firstModel(node: unknown): string | null {
  return typeof node === 'object' && node !== null && 'model' in node
    ? String((node as { model: unknown }).model)
    : null
}

function sameId(a: string | null, b: string): boolean {
  if (a === null) return false
  const full = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`)
  return full(a) === full(b)
}
