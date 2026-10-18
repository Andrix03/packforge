// Loads the pack's LabPBR maps (and their textures) through pack:// and runs the pure checks of
// shared/packValidator. Vanilla textures are only read for their size and transparency.

import { assetUrl } from '../../shared/ipc'
import {
  checkMapShape,
  checkNormal,
  checkOrphans,
  checkSpecular,
  findMapPairs,
  sortIssues,
  type Image,
  type Issue,
  type MapPair
} from '../../shared/packValidator'
import { decodePng } from '../../shared/pngCodec'

export interface ValidatorSource {
  base: string
  files: ReadonlySet<string>
  versions?: Readonly<Record<string, number>>
}

export interface ValidatorResult {
  issues: Issue[]
  /** Maps looked at. */
  maps: number
}

const PARALLEL = 6

async function fetchBytes(source: ValidatorSource, path: string): Promise<Uint8Array> {
  const response = await fetch(assetUrl(source.base, path, source.versions?.[path] ?? 0))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function loadImage(source: ValidatorSource, path: string): Promise<Image> {
  const decoded = decodePng(await fetchBytes(source, path))
  if (!decoded.ok) throw new Error(decoded.error)
  return decoded.image
}

/** Parsed `.png.mcmeta` next to `png` (the pack's wins), null when missing or not JSON. */
async function loadMcmeta(sources: ValidatorSource[], png: string): Promise<unknown> {
  const path = `${png}.mcmeta`
  const source = sources.find((s) => s.files.has(path))
  if (!source) return null
  try {
    return JSON.parse(new TextDecoder().decode(await fetchBytes(source, path))) as unknown
  } catch {
    return null
  }
}

async function checkPair(
  pair: MapPair,
  pack: ValidatorSource,
  vanilla: ValidatorSource | null
): Promise<Issue[]> {
  let map: Image
  try {
    map = await loadImage(pack, pair.path)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return [{ severity: 'error', path: pair.path, message: `PNG non leggibile: ${detail}` }]
  }
  let albedo: Image | null = null
  let albedoMcmeta: unknown = null
  const albedoSource = pair.albedoSource === 'pack' ? pack : vanilla
  if (pair.albedo && albedoSource) {
    try {
      albedo = await loadImage(albedoSource, pair.albedo)
      albedoMcmeta = await loadMcmeta(vanilla ? [pack, vanilla] : [pack], pair.albedo)
    } catch {
      albedo = null
    }
  }
  const issues =
    pair.kind === 'normal' ? checkNormal(pair.path, map) : checkSpecular(pair.path, map, albedo)
  if (albedo) {
    const mapMcmeta = await loadMcmeta([pack], pair.path)
    issues.push(
      ...checkMapShape(
        pair.path,
        { width: map.width, height: map.height, mcmeta: mapMcmeta },
        { width: albedo.width, height: albedo.height, mcmeta: albedoMcmeta }
      )
    )
  }
  return issues
}

export async function runValidator(
  pack: ValidatorSource,
  vanilla: ValidatorSource | null,
  onProgress: (done: number, total: number) => void
): Promise<ValidatorResult> {
  const files = [...pack.files]
  const pairs = findMapPairs(files, vanilla?.files ?? null)
  const issues = checkOrphans(files, pairs, vanilla !== null)
  let done = 0
  onProgress(0, pairs.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < pairs.length) {
      const pair = pairs[next++]!
      issues.push(...(await checkPair(pair, pack, vanilla)))
      onProgress(++done, pairs.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, pairs.length) }, worker))
  return { issues: sortIssues(issues), maps: pairs.length }
}
