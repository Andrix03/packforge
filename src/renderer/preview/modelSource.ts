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
import { growthVariants, stageBaseNames, stemTint } from '../../shared/crops'
import { mapPath } from '../../shared/labpbr'
import type { MeshPart, Rgb } from './BlockPreview'
import { tr } from '../../shared/i18n'

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

/** URLs of a texture's LabPBR maps (`_n`, `_s`); null where missing. */
export function labPbrUrls(
  sources: AssetSources,
  texturePath: string
): { normalUrl: string | null; specularUrl: string | null } {
  return {
    normalUrl: resolveAssetUrl(sources, mapPath(texturePath, 'normal')),
    specularUrl: resolveAssetUrl(sources, mapPath(texturePath, 'specular'))
  }
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
  const known = new Set(blocks)
  // Random variants and the upper block of tall plants made by PackForge: wheat_stage7_v2 and
  // wheat_stage7_top are a wheat_stage7.
  const names = [...new Set([match[1]!, match[1]!.replace(/_(v\d+|top)$/, '')])]
  const bases = names.flatMap((name) => [
    name,
    name.replace(TEXTURE_SUFFIXES, ''),
    name.replace(/_\d+$/, ''),
    // Growth stages: wheat_stage3 → wheat, pitcher_crop_bottom_stage_2 → pitcher_crop.
    ...stageBaseNames(name)
  ])
  // Some blocks add "_block" to their texture's name (magma → magma_block, slime → slime_block).
  for (const candidate of [...bases, ...bases.map((base) => `${base}_block`)]) {
    if (known.has(candidate)) return candidate
  }
  return null
}

/** Mesh for a single texture on a full cube (the "Cubo" shape). */
export function cubeMesh(
  key: string,
  url: string,
  mcmetaUrl: string | null,
  maps: ReturnType<typeof labPbrUrls> | null = null
): MeshPart[] {
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
      ...maps,
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
  /** One of its models has an unrotated 16×16×16 element (a full cube, for light and AO). */
  fullCube: boolean
  /** Growth stages (crops, stems, berries) in age order; empty when the block does not grow. */
  stages: GrowthStage[]
  /** Weights of the variant's random models (empty when it has a single model). */
  choiceWeights: number[]
  /** The random model drawn (index into choiceWeights). */
  choice: number
}

export interface GrowthStage {
  /** Variant key, e.g. `age=3`. */
  key: string
  /** Pack-relative paths of the textures this stage draws. */
  textures: string[]
}

/**
 * Loads a block state and its models (pack first, then vanilla) and groups
 * the quads by texture. `tintOf` colors faces with a tintindex; null means
 * the tint is not simulated (drawn white, with a warning). Without a variant key, a growing
 * block shows the stage drawing `preferTexture` (a pack path), else its last stage.
 */
export async function loadBlockMesh(
  sources: AssetSources,
  block: string,
  variantKey: string | null,
  tintOf: (tintIndex: number) => Rgb | null = () => null,
  preferTexture: string | null = null,
  /** Which of the variant's random models to draw; null = the one drawing `preferTexture`, or the first. */
  choice: number | null = null
): Promise<BlockMesh> {
  const state = await loadJson(sources, blockstatePath(block))
  const variants = blockstateVariants(state)
  if (variants.length === 0) {
    return {
      parts: [],
      variants,
      variant: null,
      fullCube: false,
      stages: [],
      choiceWeights: [],
      choice: 0,
      warnings: [tr('Nessun blockstate valido per "{0}".', block)]
    }
  }
  const resolved = new Map<string, Promise<ResolvedModel>>()
  const resolve = (id: string): Promise<ResolvedModel> => {
    let model = resolved.get(id)
    if (!model) {
      model = resolveModel(id, (path) => loadJson(sources, path))
      resolved.set(id, model)
    }
    return model
  }
  const fallback = defaultVariant(variants)
  const stages: GrowthStage[] = []
  for (const stage of growthVariants(variants, fallback)) {
    const textures = new Set<string>()
    // Every random model of the stage: their textures are all part of it.
    for (const ref of stage.choices?.map((c) => c.model) ?? stage.models) {
      for (const element of (await resolve(ref.model)).elements) {
        for (const face of Object.values(element.faces)) {
          if (face?.texture) textures.add(texturePath(face.texture.id))
        }
      }
    }
    stages.push({ key: stage.key, textures: [...textures] })
  }
  const preferred = preferTexture
    ? stages.find((stage) => stage.textures.includes(preferTexture))?.key
    : undefined
  const chosenKey = variantKey ?? preferred ?? stages.at(-1)?.key
  const variant = variants.find((v) => v.key === chosenKey) ?? fallback
  const warnings: string[] = []
  let fullCube = false
  const groups = new Map<string, { texture: TextureRef | null; quads: MeshPart['quads'] }>()
  const stem = variant ? stemTint(block, variant.key) : null

  let chosen = choice ?? 0
  if (choice === null && preferTexture && variant?.choices) {
    for (const [i, option] of variant.choices.entries()) {
      const model = await resolve(option.model.model)
      const drawn = model.elements.flatMap((e) => Object.values(e.faces).map((f) => f?.texture?.id))
      if (drawn.some((id) => id && texturePath(id) === preferTexture)) {
        chosen = i
        break
      }
    }
  }
  const picked = variant?.choices?.[chosen]?.model
  for (const ref of picked ? [picked] : (variant?.models ?? [])) {
    const model = await resolve(ref.model)
    fullCube ||= model.elements.some(
      (e) => !e.rotation && e.from.every((v) => v === 0) && e.to.every((v) => v === 16)
    )
    warnings.push(...model.warnings)
    if (model.elements.length === 0 && model.warnings.length === 0) {
      warnings.push(
        tr('Il modello {0} non ha elementi (forma speciale disegnata dal gioco).', ref.model)
      )
    }
    if (ref.uvlock && (ref.x !== 0 || ref.y !== 0)) {
      warnings.push(
        tr('Questa variante usa "uvlock": le texture ruotate potrebbero differire dal gioco.')
      )
    }
    for (const quad of buildQuads(model, ref)) {
      const key = quad.texture ? `${quad.texture.id}|${quad.texture.translucent}` : 'missing'
      const group = groups.get(key) ?? { texture: quad.texture, quads: [] }
      let tint = WHITE
      if (quad.tintIndex >= 0) {
        const color = stem ?? tintOf(quad.tintIndex)
        if (color) tint = color
        else {
          warnings.push(
            tr('La tinta di "{0}" non è simulata: alcune facce sono mostrate senza colore.', block)
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
      ...(path ? labPbrUrls(sources, path) : null),
      translucent: group.texture?.translucent ?? false,
      quads: group.quads
    })
  }
  return {
    parts,
    variants,
    variant,
    warnings: [...new Set(warnings)],
    fullCube,
    stages,
    choiceWeights: variant?.choices?.map((c) => c.weight) ?? [],
    choice: picked ? chosen : 0
  }
}
