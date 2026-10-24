// Migration of item model `overrides` (models/item/<name>.json, read up to 1.21.3; 1.21.4 replaced
// them with item definitions in items/) to an item definition, so a pack keeps its custom model
// data, pulling bows… in newer versions too (old versions keep reading the overrides).
//
// Old rule: the LAST override whose predicates all hold (value ≥ predicate) wins. Mapping of the
// predicates to the new properties after the 1.21.4 changelog and the 26.3 vanilla definitions
// (bow: pull becomes use_duration × 0.05). The item's own vanilla definition, when given, is the
// fallback (it keeps code-drawn specials, trims, its own states) and lends its tints. Pure.
import { tr } from './i18n'

type Node = Record<string, unknown>

export interface MigrationResult {
  definition: Record<string, unknown> | null
  /** How many overrides were converted. */
  converted: number
  /** Overrides skipped (unsupported predicate), in Italian. */
  skipped: string[]
}

/** Overrides of a model JSON (empty when none). */
export function modelOverrides(model: unknown): Array<{ predicate: Node; model: string }> {
  if (!isRecord(model) || !Array.isArray(model['overrides'])) return []
  return model['overrides'].flatMap((entry: unknown) =>
    isRecord(entry) && isRecord(entry['predicate']) && typeof entry['model'] === 'string'
      ? [{ predicate: entry['predicate'], model: entry['model'] }]
      : []
  )
}

/**
 * How one old predicate is tested in a definition: a node choosing `then` when it holds (value ≥
 * `threshold`), `otherwise` when not; null when there is no counterpart.
 */
function predicateTest(
  item: string,
  key: string,
  threshold: number
): ((then: Node, otherwise: Node) => Node) | null {
  const range =
    (property: string, extra: Node = {}, scale = 1) =>
    (then: Node, otherwise: Node) => ({
      type: 'minecraft:range_dispatch',
      property: `minecraft:${property}`,
      ...extra,
      ...(scale !== 1 ? { scale } : {}),
      entries: [{ threshold, model: then }],
      fallback: otherwise
    })
  const condition = (property: string) => (then: Node, otherwise: Node) =>
    threshold > 0
      ? {
          type: 'minecraft:condition',
          property: `minecraft:${property}`,
          on_true: then,
          on_false: otherwise
        }
      : then
  const select = (property: string, values: string[]) => (then: Node, otherwise: Node) =>
    threshold > 0
      ? {
          type: 'minecraft:select',
          property: `minecraft:${property}`,
          cases: [{ when: values, model: then }],
          fallback: otherwise
        }
      : then
  const name = item.replace(/^minecraft:/, '')
  switch (key.replace(/^minecraft:/, '')) {
    case 'custom_model_data':
      return range('custom_model_data')
    case 'pull':
      // Bow (and modded bows): use time in seconds; the crossbow has its own property.
      return name === 'crossbow' ? range('crossbow/pull') : range('use_duration', {}, 0.05)
    case 'pulling':
    case 'blocking':
    case 'throwing':
    case 'tooting':
      return condition('using_item')
    case 'broken':
      return condition('broken')
    case 'damaged':
      return condition('damaged')
    case 'damage':
      return range('damage')
    case 'cooldown':
      return range('cooldown')
    case 'cast':
      return condition('fishing_rod/cast')
    case 'lefthanded':
      return select('main_hand', ['left'])
    case 'charged':
      return select('charge_type', ['arrow', 'rocket'])
    case 'firework':
      return select('charge_type', ['rocket'])
    case 'filled':
      return range('bundle/fullness')
    case 'time':
      return range('time', { source: 'daytime' })
    case 'angle':
      return range('compass', { target: name === 'recovery_compass' ? 'recovery' : 'spawn' })
    default:
      return null
  }
}

/**
 * The definition of `item` (`minecraft:bow`) drawing its overrides. `base`: what the item draws
 * when no override holds (its vanilla definition's `model`, or null for its plain model).
 */
export function migrateOverrides(
  item: string,
  model: unknown,
  base: unknown = null
): MigrationResult {
  const overrides = modelOverrides(model)
  const skipped: string[] = []
  const [ns, path] = (item.includes(':') ? item : `minecraft:${item}`).split(':') as [
    string,
    string
  ]
  const tints = firstTints(base)
  const leaf = (id: string): Node => ({
    type: 'minecraft:model',
    model: id.includes(':') ? id : `minecraft:${id}`,
    ...(tints ? { tints } : {})
  })
  let tree: Node = isRecord(base) ? base : leaf(`${ns}:item/${path}`)
  let converted = 0
  // From the first to the last: each later override is tested before what came earlier.
  for (const override of overrides) {
    const tests: Array<(then: Node, otherwise: Node) => Node> = []
    let ok = true
    for (const [key, value] of Object.entries(override.predicate)) {
      const test = typeof value === 'number' ? predicateTest(item, key, value) : null
      if (!test) {
        skipped.push(tr('{0}: il predicato «{1}» non si può convertire.', override.model, key))
        ok = false
        break
      }
      tests.push(test)
    }
    if (!ok) continue
    const otherwise = tree
    // All predicates must hold: nested tests, each falling back to what came before.
    tree = tests.reduceRight<Node>((then, test) => test(then, otherwise), leaf(override.model))
    converted++
  }
  return { definition: converted > 0 ? { model: tree } : null, converted, skipped }
}

/** The tints of the first plain model in a definition node (leather's dye, potions…). */
function firstTints(node: unknown): unknown[] | null {
  if (!isRecord(node)) return null
  if (Array.isArray(node['tints']) && node['tints'].length > 0) return node['tints']
  for (const value of Object.values(node)) {
    const children = Array.isArray(value) ? value : [value]
    for (const child of children) {
      const found = firstTints(
        isRecord(child) && 'model' in child && isRecord(child['model']) ? child['model'] : child
      )
      if (found) return found
    }
  }
  return null
}

function isRecord(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
