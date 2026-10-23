// Loads the pack's LabPBR maps (and their textures) through pack:// and runs the pure checks of
// shared/packValidator. Vanilla textures are only read for their size and transparency.

import {
  checkMapShape,
  checkNormal,
  checkOrphans,
  checkSpecular,
  checkTextureMcmeta,
  mcmetaForGameTextures,
  findMapPairs,
  sortIssues,
  type Image,
  type Issue,
  type MapPair
} from '../../shared/packValidator'
import { fetchBytes, loadPng, type FileSource } from './packFetch'
import { tr } from '../../shared/i18n'

export type ValidatorSource = FileSource

export interface ValidatorResult {
  issues: Issue[]
  /** Maps looked at. */
  maps: number
}

const PARALLEL = 6

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
    map = await loadPng(pack, pair.path)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return [{ severity: 'error', path: pair.path, message: tr('PNG non leggibile: {0}', detail) }]
  }
  let albedo: Image | null = null
  let albedoMcmeta: unknown = null
  const albedoSource = pair.albedoSource === 'pack' ? pack : vanilla
  if (pair.albedo && albedoSource) {
    try {
      albedo = await loadPng(albedoSource, pair.albedo)
      albedoMcmeta = await loadMcmeta(vanilla ? [pack, vanilla] : [pack], pair.albedo)
    } catch {
      albedo = null
    }
  }
  const issues =
    pair.kind === 'normal'
      ? checkNormal(pair.path, map, albedo)
      : checkSpecular(pair.path, map, albedo)
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

async function checkGameMcmeta(
  path: string,
  pack: ValidatorSource,
  vanilla: ValidatorSource
): Promise<Issue[]> {
  const png = path.slice(0, -'.mcmeta'.length)
  let mcmeta: unknown
  try {
    mcmeta = JSON.parse(new TextDecoder().decode(await fetchBytes(pack, path))) as unknown
  } catch {
    return [{ severity: 'error', path, message: tr('Il file .mcmeta non è un JSON valido.') }]
  }
  try {
    return checkTextureMcmeta(path, await loadPng(vanilla, png), mcmeta)
  } catch {
    return []
  }
}

export async function runValidator(
  pack: ValidatorSource,
  vanilla: ValidatorSource | null,
  onProgress: (done: number, total: number) => void,
  /** Stops reading files (a newer run replaced this one). */
  signal?: AbortSignal
): Promise<ValidatorResult> {
  const files = [...pack.files]
  const pairs = findMapPairs(files, vanilla?.files ?? null)
  const issues = checkOrphans(files, pairs, vanilla?.files ?? null)
  // The pack's .png.mcmeta files that animate a game texture (valid: packs stack).
  const gameMcmeta = vanilla ? mcmetaForGameTextures(files, vanilla.files) : []
  const jobs: Array<() => Promise<Issue[]>> = [
    ...pairs.map((pair) => () => checkPair(pair, pack, vanilla)),
    ...gameMcmeta.map((path) => () => checkGameMcmeta(path, pack, vanilla!))
  ]
  let done = 0
  onProgress(0, jobs.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < jobs.length && !signal?.aborted) {
      const job = jobs[next++]!
      issues.push(...(await job()))
      onProgress(++done, jobs.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker))
  return { issues: sortIssues(issues), maps: pairs.length }
}
