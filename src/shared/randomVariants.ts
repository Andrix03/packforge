// Random variants of a block state: a variant set to an array of models makes the game pick one
// per block, weighted (`weight`, default 1), optionally rotated (`x`/`y`/`z` in 90° steps).
// Format: https://minecraft.wiki/w/Template:Nbt_inherit/blockstates/models/template (verified
// 2026-10-19). Popular crop packs use it for ripe crops (Vanilla+ Crops: 3 variants at harvest).
// The game seeds the pick from the block position; PackForge uses its own position hash, so the
// same block keeps its choice but not necessarily the game's one.

export type Vec3 = readonly [number, number, number]

/** Index of the weighted choice for the block at `at` (always the same for the same block). */
export function pickChoice(weights: readonly number[], at: Vec3): number {
  const valid = weights.map((w) => (Number.isFinite(w) && w > 0 ? Math.floor(w) : 0))
  const total = valid.reduce((sum, w) => sum + w, 0)
  if (valid.length <= 1 || total === 0) return 0
  let h = Math.imul(at[0] | 0, 3129871) ^ Math.imul(at[2] | 0, 116129781) ^ (at[1] | 0)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h ^= h >>> 16
  let roll = (h >>> 0) % total
  for (let i = 0; i < valid.length; i++) {
    roll -= valid[i]!
    if (roll < 0) return i
  }
  return 0
}

function namespaced(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Model of a new variant: the base model with every texture variable that pointed at the base
 * texture pointed at the new one (`{ parent: base, textures: { crop: new } }`). Null when the base
 * model names no such variable (the texture comes from a parent: nothing to override safely).
 */
export function variantModel(
  baseModelId: string,
  baseModel: unknown,
  baseTextureId: string,
  newTextureId: string
): Record<string, unknown> | null {
  const textures =
    isRecord(baseModel) && isRecord(baseModel['textures']) ? baseModel['textures'] : {}
  const overrides: Record<string, string> = {}
  for (const [key, value] of Object.entries(textures)) {
    const id = typeof value === 'string' ? value : isRecord(value) ? value['sprite'] : null
    if (
      typeof id === 'string' &&
      !id.startsWith('#') &&
      namespaced(id) === namespaced(baseTextureId)
    ) {
      overrides[key] = namespaced(newTextureId)
    }
  }
  if (Object.keys(overrides).length === 0) return null
  return { parent: namespaced(baseModelId), textures: overrides }
}

const ROTATIONS = [0, 90, 180, 270] as const

export interface RandomVariantsResult {
  json: Record<string, unknown>
  /** Variant keys that now pick among the models. */
  changed: string[]
}

/**
 * The block state with every variant drawing `baseModel` turned into a random pick among it and
 * `extraModels` (equal weights; with `rotate`, each also turned 0/90/180/270° around Y). Other
 * fields of the base entry (x, uvlock) are kept; a variant that is already a list only gets the
 * models it lacks appended. Multipart block states are returned unchanged.
 */
export function withRandomModels(
  blockstate: unknown,
  baseModel: string,
  extraModels: readonly string[],
  rotate: boolean
): RandomVariantsResult {
  const json: Record<string, unknown> = isRecord(blockstate) ? structuredClone(blockstate) : {}
  const variants = json['variants']
  if (!isRecord(variants)) return { json, changed: [] }
  const base = namespaced(baseModel)
  const changed: string[] = []
  for (const [key, value] of Object.entries(variants)) {
    const entries = (Array.isArray(value) ? value : [value]).filter(isRecord)
    const first = entries.find(
      (e) => typeof e['model'] === 'string' && namespaced(e['model']) === base
    )
    if (!first) continue
    const present = new Set(
      entries.map((e) => (typeof e['model'] === 'string' ? namespaced(e['model']) : ''))
    )
    const missing = extraModels.map(namespaced).filter((model) => !present.has(model))
    // The new entries copy the base one but its weight (equal odds) and Y turn (set below).
    const rest = Object.fromEntries(
      Object.entries(first).filter(([field]) => field !== 'weight' && field !== 'y')
    )
    const placed = (model: string): Record<string, unknown>[] =>
      (rotate ? ROTATIONS : [Number(first['y'] ?? 0)]).map((y) => ({
        ...rest,
        model,
        ...(y ? { y } : {})
      }))
    if (Array.isArray(value)) {
      // Already a random pick: only the models it lacks are added, the rest stays as it was.
      if (missing.length === 0) continue
      variants[key] = [...value, ...missing.flatMap(placed)]
    } else {
      variants[key] = [base, ...missing].flatMap(placed)
    }
    changed.push(key)
  }
  return { json, changed }
}

/** `<name>_v2`, `<name>_v3`… not yet in `taken` (names without folder and `.png`). */
export function variantNames(name: string, count: number, taken: ReadonlySet<string>): string[] {
  const names: string[] = []
  for (let n = 2; names.length < count && n < 100; n++) {
    const candidate = `${name}_v${n}`
    if (!taken.has(candidate)) names.push(candidate)
  }
  return names
}
