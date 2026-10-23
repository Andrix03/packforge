// Armor and other worn equipment (Phase 16 logic): `assets/<ns>/equipment/<id>.json`, where its
// textures live, the humanoid texture layout, and armor trims painted through palettes.
// Research 2026-10-22, checked on the 26.3 client data
// (equipment/*.json, 64×32 humanoid textures, 8×1 trim palettes, `palette` mcmeta). Pure.

import { comparePackVersions, type PackVersion } from './packFormat'
import { firstRelease, type FormatRange, type ModelIssue } from './modelRules'
import { tr } from './i18n'

/** Layer types and the first resource pack format that draws them. */
export const EQUIPMENT_LAYERS: Readonly<Record<string, PackVersion>> = {
  humanoid: { major: 42, minor: 0 },
  humanoid_leggings: { major: 42, minor: 0 },
  wings: { major: 42, minor: 0 },
  wolf_body: { major: 42, minor: 0 },
  horse_body: { major: 42, minor: 0 },
  llama_body: { major: 42, minor: 0 },
  pig_saddle: { major: 55, minor: 0 },
  strider_saddle: { major: 55, minor: 0 },
  camel_saddle: { major: 55, minor: 0 },
  horse_saddle: { major: 55, minor: 0 },
  donkey_saddle: { major: 55, minor: 0 },
  mule_saddle: { major: 55, minor: 0 },
  skeleton_horse_saddle: { major: 55, minor: 0 },
  zombie_horse_saddle: { major: 55, minor: 0 },
  happy_ghast_body: { major: 63, minor: 0 },
  nautilus_body: { major: 75, minor: 0 },
  nautilus_saddle: { major: 75, minor: 0 },
  camel_husk_saddle: { major: 75, minor: 0 },
  humanoid_baby: { major: 84, minor: 0 }
}

/** 1.21.4 moved the files from `models/equipment/` to `equipment/`. */
export const EQUIPMENT_FOLDER_SINCE: PackVersion = { major: 46, minor: 0 }
/** 26.3 snapshot 1: trim palettes in `textures/palettes/`. */
export const PALETTES_SINCE: PackVersion = { major: 89, minor: 0 }
/** 26.3 snapshot 6: `trim_overrides` (was `trim_palette_replacements`). */
export const TRIM_OVERRIDES_SINCE: PackVersion = { major: 94, minor: 0 }

export interface EquipmentLayer {
  type: string
  texture: string
  /** Dyeable layers: the color when undyed (ARGB int as in the JSON), or null. */
  undyed: number | null
  dyeable: boolean
  usePlayerTexture: boolean
}

/** Reads an equipment file; issues for unknown layers and what the targeted versions lack. */
export function parseEquipment(
  json: unknown,
  range: FormatRange
): { layers: EquipmentLayer[]; issues: ModelIssue[] } {
  const issues: ModelIssue[] = []
  const add = (severity: ModelIssue['severity'], message: string): void => {
    issues.push({ severity, element: null, message })
  }
  const layers: EquipmentLayer[] = []
  const root = isRecord(json) ? json : null
  if (!root || !isRecord(root['layers'])) {
    add('error', tr('Manca "layers".'))
    return { layers, issues }
  }
  for (const [type, list] of Object.entries(root['layers'])) {
    const since = EQUIPMENT_LAYERS[type]
    if (!since) {
      add('error', tr('Tipo di strato "{0}" sconosciuto.', type))
      continue
    }
    if (comparePackVersions(range.min, since) < 0) {
      add('warning', tr('"{0}" si vede dalla {1}: prima è ignorato.', type, firstRelease(since)))
    }
    for (const layer of Array.isArray(list) ? list : []) {
      if (!isRecord(layer) || typeof layer['texture'] !== 'string') {
        add('error', tr('Uno strato "{0}" non ha "texture".', type))
        continue
      }
      const dyeable = isRecord(layer['dyeable'])
      const undyed = dyeable
        ? (layer['dyeable'] as Record<string, unknown>)['color_when_undyed']
        : null
      layers.push({
        type,
        texture: layer['texture'],
        dyeable,
        undyed: typeof undyed === 'number' ? undyed : null,
        usePlayerTexture: layer['use_player_texture'] === true
      })
    }
  }
  if (
    root['trim_palette_replacements'] !== undefined &&
    comparePackVersions(range.max, TRIM_OVERRIDES_SINCE) >= 0
  ) {
    add(
      'warning',
      tr(
        '"trim_palette_replacements" si chiama "trim_overrides" dalla {0}.',
        firstRelease(TRIM_OVERRIDES_SINCE)
      )
    )
  }
  if (
    root['trim_overrides'] !== undefined &&
    comparePackVersions(range.min, TRIM_OVERRIDES_SINCE) < 0
  ) {
    add(
      'warning',
      tr('"trim_overrides" esiste dalla {0}: prima è ignorato.', firstRelease(TRIM_OVERRIDES_SINCE))
    )
  }
  return { layers, issues }
}

/** `minecraft:diamond` for layer `humanoid` → `assets/minecraft/textures/entity/equipment/humanoid/diamond.png`. */
export function equipmentTexturePath(type: string, texture: string): string {
  const [ns, path] = texture.includes(':') ? texture.split(':', 2) : ['minecraft', texture]
  return `assets/${ns}/textures/entity/equipment/${type}/${path}.png`
}

/** Where a trim material's palette lives for a pack format. */
export function trimPalettePath(material: string, format: PackVersion): string {
  return comparePackVersions(format, PALETTES_SINCE) >= 0
    ? `assets/minecraft/textures/palettes/trim/${material}.png`
    : `assets/minecraft/textures/trims/color_palettes/${material}.png`
}

export interface Pixels {
  width: number
  height: number
  data: ArrayLike<number>
}

/**
 * How the game paints a trim: every pixel whose color is the i-th color of the base palette
 * (`trim_base`, 8×1) takes the i-th color of the material's palette; alpha is kept and other
 * pixels stay as they are.
 */
export function applyPalette(image: Pixels, base: Pixels, material: Pixels): Uint8ClampedArray {
  const index = new Map<number, number>()
  for (let i = 0; i < base.width * base.height; i++) {
    const key = rgbKey(base.data, i * 4)
    if (!index.has(key)) index.set(key, i)
  }
  const out = new Uint8ClampedArray(image.data)
  for (let p = 0; p < out.length; p += 4) {
    if (out[p + 3] === 0) continue
    const i = index.get(rgbKey(out, p))
    if (i === undefined || i >= material.width * material.height) continue
    out[p] = material.data[i * 4]!
    out[p + 1] = material.data[i * 4 + 1]!
    out[p + 2] = material.data[i * 4 + 2]!
  }
  return out
}

export interface UvRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * The six faces of a box on a texture, as the game's model boxes unfold them: `u, v` the box's
 * corner on the texture, `w × h × d` its size in pixels.
 */
export function boxFaces(
  u: number,
  v: number,
  w: number,
  h: number,
  d: number
): Record<string, UvRect> {
  return {
    top: { x: u + d, y: v, width: w, height: d },
    bottom: { x: u + d + w, y: v, width: w, height: d },
    right: { x: u, y: v + d, width: d, height: h },
    front: { x: u + d, y: v + d, width: w, height: h },
    left: { x: u + d + w, y: v + d, width: d, height: h },
    back: { x: u + d + w + d, y: v + d, width: w, height: h }
  }
}

/**
 * Parts of a 64×32 humanoid armor texture (the classic player layout; left limbs reuse the right
 * ones mirrored). `humanoid_leggings` uses the same layout (legs and the body's lower part).
 */
export const HUMANOID_PARTS: ReadonlyArray<{
  id: string
  label: string
  faces: Record<string, UvRect>
}> = [
  { id: 'head', label: tr('Testa'), faces: boxFaces(0, 0, 8, 8, 8) },
  { id: 'hat', label: tr('Elmo (strato esterno)'), faces: boxFaces(32, 0, 8, 8, 8) },
  { id: 'body', label: tr('Corpo'), faces: boxFaces(16, 16, 8, 12, 4) },
  { id: 'arm', label: tr('Braccia'), faces: boxFaces(40, 16, 4, 12, 4) },
  { id: 'leg', label: tr('Gambe'), faces: boxFaces(0, 16, 4, 12, 4) }
]

function rgbKey(data: ArrayLike<number>, at: number): number {
  return (data[at]! << 16) | (data[at + 1]! << 8) | data[at + 2]!
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
