// Block models and block states (Java Edition), resolved from JSON.
// Formats checked against the 26.3 client jar (2883 models, 1288 states) and
// https://minecraft.wiki/w/Model on 2026-10-18:
// - textures values: "id", "#ref" or { "sprite": id, "force_translucent": bool } (26.1+)
// - element rotation: { origin, axis, angle, rescale? } or { origin, x?, y?, z? } (25w46a+)
// - faces: uv, texture, cullface, rotation, tintindex; elements: shade_direction_override,
//   light_emission

export type Vec3 = [number, number, number]
export type Direction = 'down' | 'up' | 'north' | 'south' | 'west' | 'east'
export const DIRECTIONS: readonly Direction[] = ['down', 'up', 'north', 'south', 'west', 'east']

export interface TextureRef {
  /** Namespaced texture id, e.g. `minecraft:block/stone`. */
  id: string
  translucent: boolean
}

export interface ModelFace {
  /** [x1, y1, x2, y2] in texture pixels (0–16), or null for the default. */
  uv: [number, number, number, number] | null
  /** Resolved texture; null when the variable is missing. */
  texture: TextureRef | null
  rotation: 0 | 90 | 180 | 270
  tintIndex: number
}

export interface AxisRotation {
  axis: 'x' | 'y' | 'z'
  angle: number
}

export interface ElementRotation {
  origin: Vec3
  /** Applied in order. */
  axes: AxisRotation[]
  rescale: boolean
}

export interface ModelElement {
  from: Vec3
  to: Vec3
  rotation: ElementRotation | null
  faces: Partial<Record<Direction, ModelFace>>
}

export interface ResolvedModel {
  elements: ModelElement[]
  ambientOcclusion: boolean
  /** Problems found while resolving (missing parents/textures), in Italian. */
  warnings: string[]
}

export type JsonLoader = (path: string) => Promise<unknown>

const MAX_PARENT_DEPTH = 32
const MAX_TEXTURE_REF_DEPTH = 16

/** `block/stone` → `minecraft:block/stone`. */
export function namespaced(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`
}

function splitId(id: string): [string, string] {
  const full = namespaced(id)
  const colon = full.indexOf(':')
  return [full.slice(0, colon), full.slice(colon + 1)]
}

export function modelPath(id: string): string {
  const [ns, path] = splitId(id)
  return `assets/${ns}/models/${path}.json`
}

export function texturePath(id: string): string {
  const [ns, path] = splitId(id)
  return `assets/${ns}/textures/${path}.png`
}

export function blockstatePath(block: string): string {
  const [ns, path] = splitId(block)
  return `assets/${ns}/blockstates/${path}.json`
}

/**
 * Loads a model and its parents, merges textures (children override) and
 * takes the elements of the nearest model that defines them.
 */
export async function resolveModel(id: string, load: JsonLoader): Promise<ResolvedModel> {
  const warnings: string[] = []
  const chain: Record<string, unknown>[] = []
  const seen = new Set<string>()
  let current: string | null = namespaced(id)

  while (current && chain.length < MAX_PARENT_DEPTH) {
    if (seen.has(current)) {
      warnings.push(`Riferimento circolare tra modelli: ${current}.`)
      break
    }
    seen.add(current)
    // Built-in parents (items, entities) have no JSON and no elements.
    if (current.startsWith('minecraft:builtin/')) break
    const json = await load(modelPath(current))
    if (!isRecord(json)) {
      warnings.push(`Modello mancante o non valido: ${current}.`)
      break
    }
    chain.push(json)
    current = typeof json['parent'] === 'string' ? namespaced(json['parent']) : null
  }

  // Root-most first, so children override parents.
  const textures: Record<string, unknown> = {}
  for (const model of [...chain].reverse()) {
    if (isRecord(model['textures'])) Object.assign(textures, model['textures'])
  }
  const withElements = chain.find((model) => Array.isArray(model['elements']))
  const ambientOcclusion = chain.find((m) => typeof m['ambientocclusion'] === 'boolean')?.[
    'ambientocclusion'
  ]

  const elements: ModelElement[] = []
  for (const raw of (withElements?.['elements'] as unknown[] | undefined) ?? []) {
    const element = parseElement(raw, textures, warnings)
    if (element) elements.push(element)
  }
  return { elements, ambientOcclusion: ambientOcclusion !== false, warnings: unique(warnings) }
}

/** Follows `#ref` variables to a texture, or null when undefined. */
export function resolveTextureVariable(
  value: string,
  textures: Record<string, unknown>
): TextureRef | null {
  let current: unknown = value
  for (let depth = 0; depth < MAX_TEXTURE_REF_DEPTH; depth++) {
    if (typeof current === 'string') {
      if (!current.startsWith('#')) return { id: namespaced(current), translucent: false }
      current = textures[current.slice(1)]
      continue
    }
    if (isRecord(current) && typeof current['sprite'] === 'string') {
      const sprite = current['sprite']
      if (sprite.startsWith('#')) {
        current = sprite
        continue
      }
      return { id: namespaced(sprite), translucent: current['force_translucent'] === true }
    }
    return null
  }
  return null
}

function parseElement(
  raw: unknown,
  textures: Record<string, unknown>,
  warnings: string[]
): ModelElement | null {
  if (!isRecord(raw)) return null
  const from = vec3(raw['from'])
  const to = vec3(raw['to'])
  if (!from || !to || !isRecord(raw['faces'])) return null

  const faces: Partial<Record<Direction, ModelFace>> = {}
  for (const direction of DIRECTIONS) {
    const face = raw['faces'][direction]
    if (!isRecord(face) || typeof face['texture'] !== 'string') continue
    const texture = resolveTextureVariable(face['texture'], textures)
    if (!texture) warnings.push(`Variabile texture non definita: ${face['texture']}.`)
    const uv = face['uv']
    faces[direction] = {
      uv:
        Array.isArray(uv) && uv.length === 4 && uv.every((n) => typeof n === 'number')
          ? (uv as [number, number, number, number])
          : null,
      texture,
      rotation: ([0, 90, 180, 270] as const).find((r) => r === face['rotation']) ?? 0,
      tintIndex: typeof face['tintindex'] === 'number' ? face['tintindex'] : -1
    }
  }
  return { from, to, rotation: parseRotation(raw['rotation']), faces }
}

function parseRotation(raw: unknown): ElementRotation | null {
  if (!isRecord(raw)) return null
  const origin = vec3(raw['origin']) ?? [8, 8, 8]
  const axes: AxisRotation[] = []
  if (
    (raw['axis'] === 'x' || raw['axis'] === 'y' || raw['axis'] === 'z') &&
    typeof raw['angle'] === 'number'
  ) {
    axes.push({ axis: raw['axis'], angle: raw['angle'] })
  } else {
    // Multi-axis form (25w46a+); applied x, y, z. The game's exact order is not
    // documented — approximate for the two vanilla models that use it.
    for (const axis of ['x', 'y', 'z'] as const) {
      if (typeof raw[axis] === 'number' && raw[axis] !== 0) axes.push({ axis, angle: raw[axis] })
    }
  }
  return axes.length > 0 ? { origin, axes, rescale: raw['rescale'] === true } : null
}

// ---------------------------------------------------------------------------
// Block states
// ---------------------------------------------------------------------------

export interface BlockModelRef {
  model: string
  x: number
  y: number
  uvlock: boolean
}

export interface BlockstateVariant {
  /** Variant key, e.g. `facing=east,half=bottom` (`''` for the single variant). */
  key: string
  /** Models to draw together (one for variants, several for multipart). */
  models: BlockModelRef[]
}

/**
 * Variants to choose from. For multipart blocks a single entry with the parts
 * that apply unconditionally (or the first part when all are conditional).
 */
export function blockstateVariants(json: unknown): BlockstateVariant[] {
  if (!isRecord(json)) return []
  if (isRecord(json['variants'])) {
    const variants: BlockstateVariant[] = []
    for (const [key, value] of Object.entries(json['variants'])) {
      const ref = firstModelRef(value)
      if (ref) variants.push({ key, models: [ref] })
    }
    return variants
  }
  if (Array.isArray(json['multipart'])) {
    const parts = json['multipart'].filter(isRecord)
    const unconditional = parts.filter((part) => part['when'] === undefined)
    const chosen = unconditional.length > 0 ? unconditional : parts.slice(0, 1)
    const models = chosen.map((part) => firstModelRef(part['apply'])).filter(isPresent)
    return models.length > 0 ? [{ key: 'multipart', models }] : []
  }
  return []
}

/** State values that best represent a block standing on its own. */
const PREFERRED_STATE = [
  'half=bottom',
  'shape=straight',
  'type=bottom',
  'axis=y',
  'face=floor',
  'open=false',
  'tilt=none',
  'powered=false',
  'lit=false',
  'waterlogged=false',
  'snowy=false'
]

/**
 * The variant to show by default: unrotated models (the block's base model)
 * with the most "plain" states win; ties keep file order.
 */
export function defaultVariant(variants: readonly BlockstateVariant[]): BlockstateVariant | null {
  let best: BlockstateVariant | null = null
  let bestScore = -1
  for (const variant of variants) {
    const parts = variant.key.split(',')
    const unrotated = variant.models.every((m) => m.x === 0 && m.y === 0) ? 100 : 0
    const score = unrotated + parts.filter((part) => PREFERRED_STATE.includes(part)).length
    if (score > bestScore) {
      best = variant
      bestScore = score
    }
  }
  return best
}

function firstModelRef(value: unknown): BlockModelRef | null {
  // Arrays are weighted random choices: the first one is shown.
  const candidate = Array.isArray(value) ? value[0] : value
  if (!isRecord(candidate) || typeof candidate['model'] !== 'string') return null
  const rotation = (v: unknown): number => (typeof v === 'number' && v % 90 === 0 ? v : 0)
  return {
    model: namespaced(candidate['model']),
    x: rotation(candidate['x']),
    y: rotation(candidate['y']),
    uvlock: candidate['uvlock'] === true
  }
}

function vec3(value: unknown): Vec3 | null {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number')
    ? (value as Vec3)
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}

function unique(list: string[]): string[] {
  return [...new Set(list)]
}
