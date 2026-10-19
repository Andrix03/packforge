import {
  FIRST_PERSON_RIGHT,
  itemQuads,
  readDisplay,
  type DisplayTransform
} from '../../shared/itemModel'
import { lightPropsFor, type LightProps } from '../../shared/lightLevels'
import { decodePng } from '../../shared/pngCodec'
import type { MeshPart, Rgb, Vec3, WorldModel } from '../preview/BlockPreview'
import {
  cubeMesh,
  labPbrUrls,
  loadBlockMesh,
  resolveAssetUrl,
  type AssetSources
} from '../preview/modelSource'
import { MINE, type Placement } from '../preview/testScenes'
import { isCtmProperties, parseProperties } from '../../shared/ctm'
import { assignTiles, CULLED, findCtmSet, type CtmSet } from '../../shared/ctmWorld'
import { pickChoice } from '../../shared/randomVariants'

export type TintOf = (block: string) => (tintIndex: number) => Rgb | null

/** The tested texture or block: what MINE stands for in a scene. */
export interface MineMesh {
  parts: MeshPart[]
  warnings: string[]
  light: LightProps
  /** Its random models (absent when it has one): each block of a scene picks one. */
  choices?: Choices
  /** A crop's growth stages (seed → ripe), for placements with a `growth`; absent otherwise. */
  stages?: Choices[]
}

/** A block's random models: their weights and the parts of each (one entry: no random pick). */
export interface Choices {
  weights: number[]
  parts: MeshPart[][]
}

/** A block (variant) with the parts of each of its random models. */
async function loadChoices(
  sources: AssetSources,
  block: string,
  variantKey: string | null,
  tint: (tintIndex: number) => Rgb | null,
  preferTexture: string | null = null
): Promise<{ mesh: Awaited<ReturnType<typeof loadBlockMesh>>; choices: Choices }> {
  const mesh = await loadBlockMesh(sources, block, variantKey, tint, preferTexture)
  if (mesh.choiceWeights.length < 2) return { mesh, choices: { weights: [], parts: [mesh.parts] } }
  const key = mesh.variant?.key ?? variantKey
  const parts = await Promise.all(
    mesh.choiceWeights.map(async (_, i) =>
      i === mesh.choice
        ? mesh.parts
        : (await loadBlockMesh(sources, block, key, tint, null, i)).parts
    )
  )
  return { mesh, choices: { weights: mesh.choiceWeights, parts } }
}

/** Only the vanilla jar, for the comparison (null when it is not loaded). */
export function vanillaOnly(sources: AssetSources): AssetSources | null {
  if (!sources.vanilla) return null
  return {
    pack: { base: sources.pack.base, files: new Set(), versions: {} },
    vanilla: sources.vanilla
  }
}

/**
 * The tested block's model, or the texture alone on a cube when no block is chosen.
 * Null when `sources` has neither (e.g. a texture new to the pack, compared with vanilla).
 */
export async function loadMine(
  sources: AssetSources,
  block: string | null,
  texturePath: string,
  tintOf: TintOf
): Promise<MineMesh | null> {
  if (block) {
    const { mesh, choices } = await loadChoices(sources, block, null, tintOf(block), texturePath)
    if (mesh.parts.length > 0 || sources.pack.files.size > 0) {
      const stages =
        mesh.stages.length > 1
          ? await Promise.all(
              mesh.stages.map(
                async (stage) =>
                  (await loadChoices(sources, block, stage.key, tintOf(block))).choices
              )
            )
          : undefined
      return {
        ...(stages ? { stages } : {}),
        ...(choices.weights.length > 1 ? { choices } : {}),
        parts: mesh.parts,
        warnings: mesh.warnings,
        light: lightPropsFor(block, mesh.fullCube)
      }
    }
    return null
  }
  const url = resolveAssetUrl(sources, texturePath)
  if (!url) return null
  return {
    parts: cubeMesh(
      texturePath,
      url,
      resolveAssetUrl(sources, `${texturePath}.mcmeta`),
      labPbrUrls(sources, texturePath)
    ),
    warnings: [],
    // The texture alone on a cube: lit like a block of the same name (glowstone.png emits).
    light: lightPropsFor(texturePath.replace(/^.*\//, '').replace(/\.png$/, ''), true)
  }
}

/**
 * Groups a scene's placements by block and loads each block (MINE becomes `mine`, with its
 * connected textures when `ctm` is given).
 */
export async function buildWorld(
  sources: AssetSources,
  placements: readonly Placement[],
  mine: MineMesh | null,
  tintOf: TintOf,
  ctm: { set: CtmSet; texturePath: string } | null = null
): Promise<WorldModel[]> {
  // Grouped by block and variant; a growing MINE also by its stage (`@mine#2`).
  const byBlock = new Map<string, Vec3[]>()
  for (const { block, at, variant, growth } of placements) {
    if (block === MINE && !mine) continue
    const stages = block === MINE ? (mine?.stages?.length ?? 0) : 0
    const key =
      stages > 1 && growth !== undefined
        ? `${MINE}#${Math.round(Math.min(1, Math.max(0, growth)) * (stages - 1))}`
        : variant
          ? `${block}|${variant}`
          : block
    byBlock.set(key, [...(byBlock.get(key) ?? []), at])
  }
  // Blocks with random models: each position picks one, like the game (`key~1`).
  const split = (
    key: string,
    positions: Vec3[],
    choices: Choices,
    light: LightProps
  ): WorldModel[] => {
    if (choices.weights.length < 2) return [{ key, positions, parts: choices.parts[0]!, light }]
    const groups = choices.parts.map((): Vec3[] => [])
    for (const at of positions) groups[pickChoice(choices.weights, at)]!.push(at)
    return groups.flatMap((group, i) =>
      group.length > 0
        ? [{ key: `${key}~${i}`, positions: group, parts: choices.parts[i]!, light }]
        : []
    )
  }
  const models = await Promise.all(
    [...byBlock].map(async ([key, positions]): Promise<WorldModel[]> => {
      const stage = /^@mine#(\d+)$/.exec(key)
      if (stage) return split(key, positions, mine!.stages![Number(stage[1])]!, mine!.light)
      const [block, variant] = key.split('|') as [string, string | undefined]
      if (block === MINE) {
        if (ctm) return ctmModels(mine!, positions, ctm.set, ctm.texturePath, sources)
        return split(
          block,
          positions,
          mine!.choices ?? { weights: [], parts: [mine!.parts] },
          mine!.light
        )
      }
      const { mesh, choices } = await loadChoices(sources, block, variant ?? null, tintOf(block))
      return split(key, positions, choices, lightPropsFor(block, mesh.fullCube))
    })
  )
  return models.flat()
}

export interface Sprite {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

/** Decodes a PNG exactly (straight alpha), or null when it can't be read. */
export async function loadSprite(url: string): Promise<Sprite | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    const decoded = decodePng(new Uint8Array(await response.arrayBuffer()))
    return decoded.ok ? decoded.image : null
  } catch {
    return null
  }
}

/**
 * The item as the game draws it in hand: its first frame (top square, or `frameHeight` rows of
 * an animation) extruded 1/16 block.
 */
export function itemMesh(
  key: string,
  url: string,
  mcmetaUrl: string | null,
  sprite: Sprite,
  frameHeight: number | null,
  maps: { normalUrl: string | null; specularUrl: string | null } | null = null
): MeshPart[] {
  const width = sprite.width
  const height = Math.min(sprite.height, frameHeight ?? Math.min(sprite.width, sprite.height))
  const opaque = (x: number, y: number): boolean => sprite.data[(y * width + x) * 4 + 3]! > 0
  return [
    {
      key,
      url,
      mcmetaUrl,
      ...maps,
      translucent: false,
      quads: itemQuads(width, height, opaque, { id: key, translucent: false }).map((quad) => ({
        quad,
        tint: [1, 1, 1]
      }))
    }
  ]
}

/**
 * First-person right-hand transform of an item, from its model and parents
 * (`models/item/<name>.json` → `item/handheld` → `item/generated`).
 */
export async function loadHandDisplay(
  sources: AssetSources,
  itemName: string
): Promise<DisplayTransform> {
  let model = `minecraft:item/${itemName}`
  for (let depth = 0; depth < 8; depth++) {
    const [namespace, path] = model.includes(':') ? model.split(':', 2) : ['minecraft', model]
    const url = resolveAssetUrl(sources, `assets/${namespace}/models/${path}.json`)
    if (!url) break
    let json: unknown
    try {
      json = await (await fetch(url)).json()
    } catch {
      break
    }
    const display = readDisplay(json, 'firstperson_righthand')
    if (display) return display
    const parent = (json as { parent?: unknown } | null)?.parent
    if (typeof parent !== 'string' || parent.startsWith('builtin/')) break
    model = parent
  }
  return FIRST_PERSON_RIGHT
}

/** The pack's connected-texture set for the tested texture (or why it cannot be shown). */
export interface CtmPreview {
  set: CtmSet | null
  /** Italian note when a set exists but cannot be previewed. */
  reason: string | null
}

export async function loadCtm(
  sources: AssetSources,
  texturePath: string,
  block: string | null
): Promise<CtmPreview> {
  const files = await Promise.all(
    [...sources.pack.files].filter(isCtmProperties).map(async (path) => {
      const url = resolveAssetUrl(sources, path)
      const text = url
        ? await fetch(url).then(
            (r) => r.text(),
            () => ''
          )
        : ''
      return { path, properties: parseProperties(text) }
    })
  )
  const found = findCtmSet(files, texturePath, block)
  return found.set ? { set: found.set, reason: null } : { set: null, reason: found.reason }
}

/**
 * The tested block with connected textures: its positions grouped by the tiles their faces show,
 * one model per group (the parts that do not use the texture stay as they are).
 */
export function ctmModels(
  mine: MineMesh,
  positions: readonly Vec3[],
  set: CtmSet,
  texturePath: string,
  sources: AssetSources
): WorldModel[] {
  const own = mine.parts.filter((part) => (part.path ?? part.key) === texturePath)
  const others = mine.parts.filter((part) => !own.includes(part))
  const quads = own.flatMap((part) => part.quads.map((entry) => ({ part, entry })))
  const tiles = assignTiles(
    positions,
    quads.map((q) => q.entry.quad),
    set.method
  )
  const groups = new Map<string, { positions: Vec3[]; tiles: number[] }>()
  positions.forEach((at, index) => {
    const signature = tiles[index]!.join(',')
    const group = groups.get(signature) ?? { positions: [], tiles: tiles[index]! }
    group.positions.push(at)
    groups.set(signature, group)
  })
  return [...groups].map(([signature, group]) => {
    const byTile = new Map<string, MeshPart>()
    group.tiles.forEach((tile, i) => {
      if (tile === CULLED) return
      const { part, entry } = quads[i]!
      const path = tile >= 0 ? set.tiles[tile] : undefined
      const partKey = path ? `${path}|ctm|${part.translucent}` : part.key
      let target = byTile.get(partKey)
      if (!target) {
        target = path
          ? {
              key: partKey,
              path,
              // A missing tile shows the missing texture: the pack is incomplete.
              url: resolveAssetUrl(sources, path),
              mcmetaUrl: null,
              ...labPbrUrls(sources, path),
              translucent: part.translucent,
              quads: []
            }
          : { ...part, quads: [] }
        byTile.set(partKey, target)
      }
      target.quads.push(entry)
    })
    return {
      key: `${MINE}|ctm|${signature}`,
      positions: group.positions,
      parts: [...others, ...byTile.values()],
      light: mine.light
    }
  })
}
