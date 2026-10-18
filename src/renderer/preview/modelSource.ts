import { buildQuads, type Quad } from '../../shared/blockGeometry'
import {
  blockstatePath,
  blockstateVariants,
  defaultVariant,
  resolveModel,
  texturePath,
  type BlockstateVariant,
  type ResolvedModel,
  type TextureRef
} from '../../shared/blockModel'
import { assetUrl } from '../../shared/ipc'
import type { MeshPart, Rgb } from './BlockPreview'

/** Where preview assets come from: the pack first, then the vanilla jar. */
export interface AssetSources {
  pack: { base: string; files: ReadonlySet<string>; versions: Readonly<Record<string, number>> }
  vanilla: { base: string; files: ReadonlySet<string> } | null
}

const WHITE: Rgb = [1, 1, 1]

/** URL of an asset, preferring the pack over vanilla; null when neither has it. */
export function resolveAssetUrl(sources: AssetSources, path: string): string | null {
  if (sources.pack.files.has(path)) {
    return assetUrl(sources.pack.base, path, sources.pack.versions[path] ?? 0)
  }
  if (sources.vanilla?.files.has(path)) return assetUrl(sources.vanilla.base, path)
  return null
}

async function loadJson(sources: AssetSources, path: string): Promise<unknown> {
  const url = resolveAssetUrl(sources, path)
  if (!url) return null
  try {
    return await (await fetch(url)).json()
  } catch {
    return null
  }
}

/** Block names with a block state file, from the pack and vanilla, sorted. */
export function listBlocks(sources: AssetSources): string[] {
  const names = new Set<string>()
  const collect = (files: ReadonlySet<string>): void => {
    for (const path of files) {
      const match = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path)
      if (match) names.add(match[1] === 'minecraft' ? match[2]! : `${match[1]}:${match[2]}`)
    }
  }
  collect(sources.pack.files)
  if (sources.vanilla) collect(sources.vanilla.files)
  return [...names].sort()
}

const TEXTURE_SUFFIXES = /_(top|bottom|side|front|back|end|inner|outer|particle|on|off|lit|base)$/

/**
 * Block most likely to use a texture: `block/oak_log_top` → `oak_log`.
 * Returns null for non-block textures or when no such block exists.
 */
export function guessBlockForTexture(textureKey: string, blocks: readonly string[]): string | null {
  const match = /^assets\/minecraft\/textures\/block\/(.+)$/.exec(textureKey)
  if (!match) return null
  const name = match[1]!
  const known = new Set(blocks)
  for (const candidate of [name, name.replace(TEXTURE_SUFFIXES, ''), name.replace(/_\d+$/, '')]) {
    if (known.has(candidate)) return candidate
  }
  return null
}

/** Mesh for a single texture on a full cube (the "Cubo" shape). */
export function cubeMesh(key: string, url: string, mcmetaUrl: string | null): MeshPart[] {
  const texture: TextureRef = { id: key, translucent: false }
  const face = { uv: null, texture, rotation: 0 as const, tintIndex: -1 }
  const model: ResolvedModel = {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        rotation: null,
        faces: { down: face, up: face, north: face, south: face, west: face, east: face }
      }
    ],
    ambientOcclusion: true,
    warnings: []
  }
  return [
    {
      key,
      url,
      mcmetaUrl,
      translucent: false,
      quads: buildQuads(model, { x: 0, y: 0 }).map((quad) => ({ quad, tint: WHITE }))
    }
  ]
}

export interface BlockMesh {
  parts: MeshPart[]
  variants: BlockstateVariant[]
  variant: BlockstateVariant | null
  warnings: string[]
}

/**
 * Loads a block state and its models (pack first, then vanilla) and groups
 * the quads by texture. `tintOf` colors faces with a tintindex; null means
 * the tint is not simulated (drawn white, with a warning).
 */
export async function loadBlockMesh(
  sources: AssetSources,
  block: string,
  variantKey: string | null,
  tintOf: (tintIndex: number) => Rgb | null = () => null
): Promise<BlockMesh> {
  const state = await loadJson(sources, blockstatePath(block))
  const variants = blockstateVariants(state)
  if (variants.length === 0) {
    return {
      parts: [],
      variants,
      variant: null,
      warnings: [`Nessun blockstate valido per "${block}".`]
    }
  }
  const variant = variants.find((v) => v.key === variantKey) ?? defaultVariant(variants)
  const warnings: string[] = []
  const groups = new Map<string, { texture: TextureRef | null; quads: MeshPart['quads'] }>()

  for (const ref of variant?.models ?? []) {
    const model = await resolveModel(ref.model, (path) => loadJson(sources, path))
    warnings.push(...model.warnings)
    if (model.elements.length === 0 && model.warnings.length === 0) {
      warnings.push(`Il modello ${ref.model} non ha elementi (forma speciale disegnata dal gioco).`)
    }
    if (ref.uvlock && (ref.x !== 0 || ref.y !== 0)) {
      warnings.push(
        'Questa variante usa "uvlock": le texture ruotate potrebbero differire dal gioco.'
      )
    }
    for (const quad of buildQuads(model, ref)) {
      const key = quad.texture ? `${quad.texture.id}|${quad.texture.translucent}` : 'missing'
      const group = groups.get(key) ?? { texture: quad.texture, quads: [] }
      let tint = WHITE
      if (quad.tintIndex >= 0) {
        const color = tintOf(quad.tintIndex)
        if (color) tint = color
        else {
          warnings.push(
            `La tinta di "${block}" non è simulata: alcune facce sono mostrate senza colore.`
          )
        }
      }
      group.quads.push({ quad: quad as Quad, tint })
      groups.set(key, group)
    }
  }

  const parts: MeshPart[] = []
  for (const [key, group] of groups) {
    const path = group.texture ? texturePath(group.texture.id) : null
    const mcmetaPath = path ? `${path}.mcmeta` : null
    parts.push({
      key,
      path,
      url: path ? resolveAssetUrl(sources, path) : null,
      mcmetaUrl: mcmetaPath ? resolveAssetUrl(sources, mcmetaPath) : null,
      translucent: group.texture?.translucent ?? false,
      quads: group.quads
    })
  }
  return { parts, variants, variant, warnings: [...new Set(warnings)] }
}
