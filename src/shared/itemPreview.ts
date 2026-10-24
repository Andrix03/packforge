// What the item preview needs besides the definition itself (shared/itemDefinition.ts): which item
// a texture belongs to, the values a definition's properties can take, and an item model resolved
// for drawing (flat `item/generated` layers or elements, with its display transforms). Checked on
// the 26.3 client data (bow, compass, clock, crossbow definitions; item/generated, handheld). Pure.
import {
  modelPath,
  namespaced,
  resolveModel,
  resolveTextureVariable,
  type JsonLoader,
  type ResolvedModel,
  type TextureRef
} from './blockModel'
import { itemProperties as itemPropertiesOf, modelsFor, type ItemNode } from './itemDefinition'
import { readDisplay, type DisplayTransform } from './itemModel'

/** Display contexts the preview offers, as named in definitions and model `display`. */
export const DISPLAY_CONTEXTS = [
  'gui',
  'firstperson_righthand',
  'thirdperson_righthand',
  'ground',
  'head',
  'fixed'
] as const

/**
 * Item names a texture may belong to, most likely first: `item/bow_pulling_0` → bow_pulling_0,
 * bow_pulling, bow (the caller keeps the first one with a definition).
 */
export function itemNamesFor(texturePath: string): string[] {
  const m = /^assets\/[^/]+\/textures\/item\/([a-z0-9_.-]+)\.png$/.exec(texturePath)
  if (!m) return []
  const parts = m[1]!.split('_')
  const names: string[] = []
  for (let n = parts.length; n >= 1; n--) names.push(parts.slice(0, n).join('_'))
  return names
}

/** The string values a `select` property is compared with in a definition (first seen first). */
export function selectValues(root: ItemNode | null, property: string): string[] {
  const values = new Set<string>()
  visit(root, (node) => {
    if (node.type !== 'select' || node.property !== property) return
    for (const entry of node.cases) {
      for (const when of entry.when) {
        if (typeof when === 'string') values.add(when.replace(/^minecraft:/, ''))
      }
    }
  })
  return [...values]
}

/**
 * The span worth sliding through for a `range_dispatch` property, in the property's own units
 * (thresholds divided by the scale): from 0 (or the lowest threshold) to a bit past the highest.
 */
export function numberRange(
  root: ItemNode | null,
  property: string
): { min: number; max: number; step: number } {
  const values: number[] = []
  visit(root, (node) => {
    if (node.type !== 'range_dispatch' || node.property !== property) return
    const scale = node.scale === 0 ? 1 : node.scale
    for (const entry of node.entries) values.push(entry.threshold / scale)
  })
  if (values.length === 0) return { min: 0, max: 1, step: 0.01 }
  const low = Math.min(0, ...values)
  const high = Math.max(...values)
  const max = high <= low ? low + 1 : high + (high - low) * 0.25
  // Long spans (ticks of use) slide in whole steps.
  return { min: low, max, step: max - low >= 10 ? 1 : (max - low) / 100 }
}

export interface ItemModelDraw {
  id: string
  /** Flat sprite layers (`item/generated`: layer0, layer1…) or null for a model with elements. */
  layers: TextureRef[] | null
  elements: ResolvedModel | null
  /** Display transforms by context, the nearest model in the parent chain winning. */
  display: Record<string, DisplayTransform>
  /** Drawn by code in the game (shield, chest…): the preview has nothing to show. */
  builtin: boolean
  warnings: string[]
}

const MAX_DEPTH = 32

/** Resolves an item model for drawing. */
export async function resolveItemModel(id: string, load: JsonLoader): Promise<ItemModelDraw> {
  const chain: Record<string, unknown>[] = []
  let current: string | null = namespaced(id)
  let generated = false
  let builtin = false
  const seen = new Set<string>()
  while (current && chain.length < MAX_DEPTH && !seen.has(current)) {
    seen.add(current)
    if (current === 'minecraft:builtin/generated') {
      generated = true
      break
    }
    if (current.startsWith('minecraft:builtin/')) {
      builtin = true
      break
    }
    const json = await load(modelPath(current))
    if (!isRecord(json)) break
    chain.push(json)
    current = typeof json['parent'] === 'string' ? namespaced(json['parent']) : null
  }
  const display: Record<string, DisplayTransform> = {}
  for (const model of [...chain].reverse()) {
    if (!isRecord(model['display'])) continue
    for (const slot of Object.keys(model['display'])) {
      const transform = readDisplay(model, slot)
      if (transform) display[slot] = transform
    }
  }
  const hasElements = chain.some((model) => Array.isArray(model['elements']))
  if (generated && !hasElements) {
    const textures: Record<string, unknown> = {}
    for (const model of [...chain].reverse()) {
      if (isRecord(model['textures'])) Object.assign(textures, model['textures'])
    }
    const layers: TextureRef[] = []
    for (let i = 0; i < 5; i++) {
      const value = textures[`layer${i}`]
      if (typeof value !== 'string' && !isRecord(value)) break
      const ref = resolveTextureVariable(typeof value === 'string' ? value : `#layer${i}`, textures)
      if (ref) layers.push(ref)
    }
    return { id, layers, elements: null, display, builtin: false, warnings: [] }
  }
  if (!hasElements) {
    return { id, layers: null, elements: null, display, builtin: true, warnings: [] }
  }
  const elements = await resolveModel(id, load)
  return {
    id,
    layers: null,
    elements,
    display,
    builtin: builtin && elements.elements.length === 0,
    warnings: elements.warnings
  }
}

function visit(root: ItemNode | null, fn: (node: ItemNode) => void): void {
  if (!root) return
  fn(root)
  switch (root.type) {
    case 'composite':
      root.models.forEach((m) => visit(m, fn))
      return
    case 'condition':
      visit(root.onTrue, fn)
      visit(root.onFalse, fn)
      return
    case 'select':
      root.cases.forEach((c) => visit(c.model, fn))
      visit(root.fallback, fn)
      return
    case 'range_dispatch':
      root.entries.forEach((e) => visit(e.model, fn))
      visit(root.fallback, fn)
      return
    default:
      return
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A state of the item's properties (the display context is chosen apart). */
export interface ItemState {
  conditions: string[]
  selects: Record<string, string>
  numbers: Record<string, number>
}

const MAX_STATES = 4096

/**
 * The first state (fewest properties set) in which the definition draws `model` in `context`, or
 * null: so a texture of a bow being pulled opens on the bow being pulled.
 */
export function stateShowing(
  root: ItemNode | null,
  model: string,
  context: string
): ItemState | null {
  const target = namespaced(model)
  const { conditions, selects, numbers } = itemPropertiesOf(root)
  const numberValues = (property: string): number[] => {
    const values = new Set<number>([0])
    visit(root, (node) => {
      if (node.type !== 'range_dispatch' || node.property !== property) return
      const scale = node.scale === 0 ? 1 : node.scale
      for (const entry of node.entries) values.add(entry.threshold / scale)
    })
    return [...values].sort((a, b) => a - b)
  }
  const states: ItemState[] = [{ conditions: [], selects: {}, numbers: {} }]
  const expand = <T>(
    list: string[],
    options: (property: string) => T[],
    apply: (state: ItemState, property: string, value: T) => ItemState
  ): void => {
    for (const property of list) {
      const next: ItemState[] = []
      for (const state of states) {
        for (const value of options(property)) {
          if (next.length < MAX_STATES) next.push(apply(state, property, value))
        }
      }
      states.splice(0, states.length, ...next)
    }
  }
  expand(
    conditions,
    () => [false, true],
    (s, p, on) => (on ? { ...s, conditions: [...s.conditions, p] } : s)
  )
  expand(
    selects.filter((p) => p !== 'display_context'),
    (p) => ['', ...selectValues(root, p)],
    (s, p, v) => (v === '' ? s : { ...s, selects: { ...s.selects, [p]: v } })
  )
  expand(numbers, numberValues, (s, p, v) =>
    v === 0 ? s : { ...s, numbers: { ...s.numbers, [p]: v } }
  )
  const size = (s: ItemState): number =>
    s.conditions.length + Object.keys(s.selects).length + Object.keys(s.numbers).length
  return (
    [...states]
      .sort((a, b) => size(a) - size(b))
      .find((state) =>
        modelsFor(root, {
          displayContext: context,
          conditions: new Set(state.conditions),
          selects: state.selects,
          numbers: state.numbers
        }).some((id) => namespaced(id) === target)
      ) ?? null
  )
}

/** An item texture: `assets/<ns>/textures/item/….png`. */
export function isItemTexture(path: string): boolean {
  return /^assets\/[^/]+\/textures\/item\/.+\.png$/.test(path)
}
