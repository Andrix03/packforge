// Item model definitions (`assets/<ns>/items/<id>.json`, 1.21.4+): reading, checking per pack
// format, and choosing what to draw for a preview situation (held in hand, in the GUI, a bow
// being pulled…). Research 2026-10-22, checked on the 1658
// definitions of the 26.3 client. Pure.

import { comparePackVersions, type PackVersion } from './packFormat'
import { firstRelease, type FormatRange, type ModelIssue, type ModelSeverity } from './modelRules'
import { tr } from './i18n'

export type ItemNode =
  | { type: 'model'; model: string; tints: unknown[] }
  | { type: 'composite'; models: ItemNode[] }
  | { type: 'condition'; property: string; onTrue: ItemNode; onFalse: ItemNode }
  | {
      type: 'select'
      property: string
      cases: Array<{ when: unknown[]; model: ItemNode }>
      fallback: ItemNode | null
    }
  | {
      type: 'range_dispatch'
      property: string
      scale: number
      entries: Array<{ threshold: number; model: ItemNode }>
      fallback: ItemNode | null
    }
  | { type: 'empty' }
  | { type: 'bundle/selected_item' }
  | { type: 'special'; special: string; base: string }

/** First resource pack format of each feature (release formats). */
export const ITEM_FEATURES = {
  /** 1.21.4: the `items/` folder itself (older versions use models/item overrides). */
  definitions: { major: 46, minor: 0 },
  oversizedInGui: { major: 63, minor: 0 },
  swapAnimationScale: { major: 75, minor: 0 },
  /** 26.1: `transformation`, specials bell / book / end_cube. */
  transformation: { major: 84, minor: 0 }
} as const satisfies Record<string, PackVersion>

/** Special renderers: the format they appeared in and, if gone, the one that removed them. */
const SPECIALS: Record<string, { since: PackVersion; removed?: PackVersion }> = {
  banner: { since: ITEM_FEATURES.definitions },
  bed: { since: ITEM_FEATURES.definitions, removed: { major: 88, minor: 0 } },
  bell: { since: ITEM_FEATURES.transformation },
  book: { since: ITEM_FEATURES.transformation },
  chest: { since: ITEM_FEATURES.definitions },
  conduit: { since: ITEM_FEATURES.definitions },
  copper_golem_statue: { since: { major: 69, minor: 0 } },
  decorated_pot: { since: ITEM_FEATURES.definitions },
  end_cube: { since: ITEM_FEATURES.transformation },
  hanging_sign: { since: ITEM_FEATURES.definitions, removed: { major: 88, minor: 0 } },
  head: { since: ITEM_FEATURES.definitions },
  player_head: { since: { major: 63, minor: 0 } },
  shield: { since: ITEM_FEATURES.definitions },
  shulker_box: { since: ITEM_FEATURES.definitions },
  standing_sign: { since: ITEM_FEATURES.definitions, removed: { major: 88, minor: 0 } },
  trident: { since: ITEM_FEATURES.definitions }
}

const TINTS = new Set([
  'constant',
  'custom_model_data',
  'dye',
  'firework',
  'grass',
  'map_color',
  'potion',
  'team'
])
/** `map_color` tints were removed in 26.3 (wiki history; provisional). */
const MAP_COLOR_REMOVED: PackVersion = { major: 91, minor: 0 }

export interface ParsedItemDefinition {
  root: ItemNode | null
  issues: ModelIssue[]
}

/** Reads a definition and reports what breaks or is ignored in the targeted versions. */
export function parseItemDefinition(json: unknown, range: FormatRange): ParsedItemDefinition {
  const issues: ModelIssue[] = []
  const add = (severity: ModelSeverity, message: string): void => {
    issues.push({ severity, element: null, message })
  }
  const tooOld = (feature: PackVersion): boolean => comparePackVersions(range.min, feature) < 0
  const reaches = (feature: PackVersion): boolean => comparePackVersions(range.max, feature) >= 0
  if (!isRecord(json)) {
    add('error', tr('La definizione non è un oggetto JSON.'))
    return { root: null, issues }
  }
  if (tooOld(ITEM_FEATURES.definitions)) {
    add(
      'info',
      tr(
        'Le definizioni items/ esistono dalla {0}: prima il gioco usa models/item.',
        firstRelease(ITEM_FEATURES.definitions)
      )
    )
  }
  for (const [key, feature] of [
    ['oversized_in_gui', ITEM_FEATURES.oversizedInGui],
    ['swap_animation_scale', ITEM_FEATURES.swapAnimationScale]
  ] as const) {
    if (json[key] !== undefined && tooOld(feature)) {
      add('warning', tr('"{0}" funziona dalla {1}: prima è ignorato.', key, firstRelease(feature)))
    }
  }

  const node = (value: unknown, where: string): ItemNode | null => {
    if (!isRecord(value) || typeof value['type'] !== 'string') {
      add('error', tr('{0}: manca "type".', where))
      return null
    }
    if (value['transformation'] !== undefined && tooOld(ITEM_FEATURES.transformation)) {
      add(
        'error',
        tr(
          '{0}: "transformation" funziona dalla {1}.',
          where,
          firstRelease(ITEM_FEATURES.transformation)
        )
      )
    }
    const type = withoutNamespace(value['type'])
    switch (type) {
      case 'model': {
        if (typeof value['model'] !== 'string') {
          add('error', tr('{0}: "model" deve essere l’id di un modello.', where))
          return null
        }
        const tints = Array.isArray(value['tints']) ? value['tints'] : []
        for (const tint of tints) {
          const kind =
            isRecord(tint) && typeof tint['type'] === 'string'
              ? withoutNamespace(tint['type'])
              : null
          if (kind === null || !TINTS.has(kind)) {
            add('error', tr('{0}: tinta sconosciuta ({1}).', where, String(kind)))
          } else if (kind === 'map_color' && reaches(MAP_COLOR_REMOVED)) {
            add('error', tr('{0}: la tinta "map_color" non esiste più dalla 26.3.', where))
          }
        }
        return { type, model: value['model'], tints }
      }
      case 'composite': {
        const models = Array.isArray(value['models']) ? value['models'] : null
        if (!models) add('error', tr('{0}: "models" deve essere una lista.', where))
        return {
          type,
          models: (models ?? []).flatMap((m, i) => node(m, `${where}.models[${i}]`) ?? [])
        }
      }
      case 'condition': {
        const onTrue = node(value['on_true'], `${where}.on_true`)
        const onFalse = node(value['on_false'], `${where}.on_false`)
        if (typeof value['property'] !== 'string') add('error', tr('{0}: manca "property".', where))
        if (!onTrue || !onFalse) return null
        return { type, property: withoutNamespace(String(value['property'])), onTrue, onFalse }
      }
      case 'select': {
        const cases: Array<{ when: unknown[]; model: ItemNode }> = []
        for (const [i, entry] of (Array.isArray(value['cases']) ? value['cases'] : []).entries()) {
          const model = isRecord(entry) ? node(entry['model'], `${where}.cases[${i}]`) : null
          if (!isRecord(entry) || entry['when'] === undefined || !model) continue
          cases.push({
            when: Array.isArray(entry['when']) ? entry['when'] : [entry['when']],
            model
          })
        }
        if (typeof value['property'] !== 'string') add('error', tr('{0}: manca "property".', where))
        return {
          type,
          property: withoutNamespace(String(value['property'])),
          cases,
          fallback:
            value['fallback'] === undefined ? null : node(value['fallback'], `${where}.fallback`)
        }
      }
      case 'range_dispatch': {
        const entries: Array<{ threshold: number; model: ItemNode }> = []
        for (const [i, entry] of (Array.isArray(value['entries'])
          ? value['entries']
          : []
        ).entries()) {
          const model = isRecord(entry) ? node(entry['model'], `${where}.entries[${i}]`) : null
          if (!isRecord(entry) || typeof entry['threshold'] !== 'number' || !model) continue
          entries.push({ threshold: entry['threshold'], model })
        }
        if (typeof value['property'] !== 'string') add('error', tr('{0}: manca "property".', where))
        return {
          type,
          property: withoutNamespace(String(value['property'])),
          scale: typeof value['scale'] === 'number' ? value['scale'] : 1,
          entries: entries.sort((a, b) => a.threshold - b.threshold),
          fallback:
            value['fallback'] === undefined ? null : node(value['fallback'], `${where}.fallback`)
        }
      }
      case 'empty':
      case 'bundle/selected_item':
        return { type }
      case 'special': {
        const special =
          isRecord(value['model']) && typeof value['model']['type'] === 'string'
            ? withoutNamespace(value['model']['type'])
            : null
        if (typeof value['base'] !== 'string') add('error', tr('{0}: manca "base".', where))
        const rule = special === null ? undefined : SPECIALS[special]
        if (!rule) {
          add('error', tr('{0}: modello speciale sconosciuto ({1}).', where, String(special)))
        } else if (rule.removed && reaches(rule.removed)) {
          add(
            'error',
            tr(
              '{0}: lo speciale "{1}" non esiste più dalla {2}.',
              where,
              special,
              firstRelease(rule.removed)
            )
          )
        } else if (tooOld(rule.since)) {
          add(
            'error',
            tr('{0}: lo speciale "{1}" esiste dalla {2}.', where, special, firstRelease(rule.since))
          )
        }
        return { type, special: special ?? '', base: String(value['base'] ?? '') }
      }
      default:
        add(
          'error',
          tr('{0}: tipo "{1}" sconosciuto: il gioco non carica la definizione.', where, type)
        )
        return null
    }
  }

  const root = node(json['model'], 'model')
  return { root, issues }
}

/** A situation to preview: where the item is drawn and the state of the properties. */
export interface ItemSituation {
  displayContext: string
  /** Boolean properties that are true (e.g. using_item, broken); the rest are false. */
  conditions?: ReadonlySet<string>
  /** Values of select properties other than display_context (e.g. main_hand: "right"). */
  selects?: Readonly<Record<string, string>>
  /** Values of numeric properties (e.g. crossbow/pull: 0.5); missing = 0. */
  numbers?: Readonly<Record<string, number>>
}

/**
 * The models drawn in `situation`, in drawing order: block/item model ids, or `special:<type>`
 * entries (with their base model) the preview draws as their base.
 */
export function modelsFor(root: ItemNode | null, situation: ItemSituation): string[] {
  return drawnModels(root, situation).map((drawn) => drawn.model)
}

/** Like `modelsFor`, with the tints of each model (by tint index; none for specials). */
export function drawnModels(
  root: ItemNode | null,
  situation: ItemSituation
): Array<{ model: string; tints: unknown[] }> {
  const out: Array<{ model: string; tints: unknown[] }> = []
  const visit = (node: ItemNode | null): void => {
    if (!node) return
    switch (node.type) {
      case 'model':
        out.push({ model: node.model, tints: node.tints })
        return
      case 'composite':
        node.models.forEach(visit)
        return
      case 'condition':
        visit(situation.conditions?.has(node.property) ? node.onTrue : node.onFalse)
        return
      case 'select': {
        const value =
          node.property === 'display_context'
            ? situation.displayContext
            : situation.selects?.[node.property]
        const hit = node.cases.find((c) =>
          c.when.some((w) => typeof w === 'string' && withoutNamespace(w) === value)
        )
        visit(hit ? hit.model : node.fallback)
        return
      }
      case 'range_dispatch': {
        const value = (situation.numbers?.[node.property] ?? 0) * node.scale
        // The last entry whose threshold is at or below the value.
        let chosen: ItemNode | null = node.fallback
        for (const entry of node.entries) if (entry.threshold <= value) chosen = entry.model
        visit(chosen)
        return
      }
      case 'special':
        out.push({ model: node.base, tints: [] })
        return
      case 'empty':
      case 'bundle/selected_item':
        return
    }
  }
  visit(root)
  return out
}

/** Properties the definition reacts to (to offer them as switches/sliders in a preview). */
export function itemProperties(root: ItemNode | null): {
  conditions: string[]
  selects: string[]
  numbers: string[]
} {
  const conditions = new Set<string>()
  const selects = new Set<string>()
  const numbers = new Set<string>()
  const visit = (node: ItemNode | null): void => {
    if (!node) return
    if (node.type === 'composite') node.models.forEach(visit)
    else if (node.type === 'condition') {
      conditions.add(node.property)
      visit(node.onTrue)
      visit(node.onFalse)
    } else if (node.type === 'select') {
      selects.add(node.property)
      node.cases.forEach((c) => visit(c.model))
      visit(node.fallback)
    } else if (node.type === 'range_dispatch') {
      numbers.add(node.property)
      node.entries.forEach((e) => visit(e.model))
      visit(node.fallback)
    }
  }
  visit(root)
  return { conditions: [...conditions], selects: [...selects], numbers: [...numbers] }
}

function withoutNamespace(id: string): string {
  return id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
