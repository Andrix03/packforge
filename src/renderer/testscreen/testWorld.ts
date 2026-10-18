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

export type TintOf = (block: string) => (tintIndex: number) => Rgb | null

/** The tested texture or block: what MINE stands for in a scene. */
export interface MineMesh {
  parts: MeshPart[]
  warnings: string[]
  light: LightProps
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
    const mesh = await loadBlockMesh(sources, block, null, tintOf(block))
    if (mesh.parts.length > 0 || sources.pack.files.size > 0) {
      return {
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

/** Groups a scene's placements by block and loads each block (MINE becomes `mine`). */
export async function buildWorld(
  sources: AssetSources,
  placements: readonly Placement[],
  mine: MineMesh | null,
  tintOf: TintOf
): Promise<WorldModel[]> {
  const byBlock = new Map<string, Vec3[]>()
  for (const { block, at } of placements) {
    if (block === MINE && !mine) continue
    byBlock.set(block, [...(byBlock.get(block) ?? []), at])
  }
  return Promise.all(
    [...byBlock].map(async ([block, positions]): Promise<WorldModel> => {
      if (block === MINE) return { key: block, positions, parts: mine!.parts, light: mine!.light }
      const mesh = await loadBlockMesh(sources, block, null, tintOf(block))
      return {
        key: block,
        positions,
        parts: mesh.parts,
        light: lightPropsFor(block, mesh.fullCube)
      }
    })
  )
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
