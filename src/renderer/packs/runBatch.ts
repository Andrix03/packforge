// Writes the maps planned by shared/batchMaps: reads each albedo (and the map it replaces)
// through pack://, builds the bytes, saves through IPC. Animated textures also get the maps'
// .png.mcmeta (Iris animates a map from its own file).

import { parseAnimation } from '../../shared/animation'
import {
  buildNormal,
  buildSpecular,
  type BatchAction,
  type BatchPlanEntry,
  type ReliefOptions
} from '../../shared/batchMaps'
import { assetUrl } from '../../shared/ipc'
import { mapPath, type MapKind } from '../../shared/labpbr'
import type { MaterialOptions } from '../../shared/materialPresets'
import { decodePng, type DecodedPng } from '../../shared/pngCodec'
import { mapMcmeta } from '../editor/frames'
import type { ValidatorSource } from './runValidator'

export interface BatchSettings {
  material: MaterialOptions
  relief: ReliefOptions
  /** Neighbours wrap around the edges (repeating block textures). */
  wrap: boolean
}

export interface BatchResult {
  written: number
  errors: Array<{ path: string; message: string }>
}

async function fetchBytes(pack: ValidatorSource, path: string): Promise<Uint8Array> {
  const response = await fetch(assetUrl(pack.base, path, pack.versions?.[path] ?? 0))
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function loadPng(pack: ValidatorSource, path: string): Promise<DecodedPng> {
  const decoded = decodePng(await fetchBytes(pack, path))
  if (!decoded.ok) throw new Error(decoded.error)
  return decoded.image
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

async function applyEntry(
  pack: ValidatorSource,
  entry: BatchPlanEntry,
  settings: BatchSettings
): Promise<number> {
  const jobs = (['normal', 'specular'] as const).filter((kind): kind is MapKind => {
    const action: BatchAction | null = entry[kind]
    return action === 'create' || action === 'overwrite'
  })
  if (jobs.length === 0) return 0
  const albedo = await loadPng(pack, entry.albedo)
  const { width, height, data } = albedo
  const mcmetaPath = `${entry.albedo}.mcmeta`
  const mcmetaText = pack.files.has(mcmetaPath)
    ? new TextDecoder().decode(await fetchBytes(pack, mcmetaPath))
    : null
  let frameHeight = height
  if (mcmetaText !== null) {
    const parsed = parseAnimation(JSON.parse(mcmetaText) as unknown, width, height)
    if (parsed.ok && parsed.animation && parsed.animation.columns === 1) {
      frameHeight = parsed.animation.frameHeight
    }
  }
  let written = 0
  for (const kind of jobs) {
    const path = mapPath(entry.albedo, kind)
    // Only an existing map of the same size is built upon (its emission or AO are kept).
    let existing: ArrayLike<number> | null = null
    if (entry[kind] === 'overwrite') {
      const old = await loadPng(pack, path).catch(() => null)
      if (old && old.width === width && old.height === height) existing = old.data
    }
    const bytes =
      kind === 'specular'
        ? buildSpecular(data, width, height, existing, settings.material)
        : buildNormal(
            data,
            { width, height, frameHeight, wrap: settings.wrap },
            existing,
            settings.relief
          )
    const saved = await window.api.invoke(
      'texture:save',
      path,
      width,
      height,
      new Uint8Array(bytes)
    )
    if (!saved.ok) throw new Error(saved.error)
    if (frameHeight !== height) {
      const meta = await window.api.invoke('texture:saveMcmeta', path, mapMcmeta(mcmetaText, 1))
      if (!meta.ok) throw new Error(meta.error)
    }
    written++
  }
  return written
}

export async function runBatch(
  pack: ValidatorSource,
  plan: readonly BatchPlanEntry[],
  settings: BatchSettings,
  onProgress: (done: number, total: number) => void
): Promise<BatchResult> {
  const result: BatchResult = { written: 0, errors: [] }
  onProgress(0, plan.length)
  for (const [index, entry] of plan.entries()) {
    try {
      result.written += await applyEntry(pack, entry, settings)
    } catch (error) {
      result.errors.push({ path: entry.albedo, message: message(error) })
    }
    onProgress(index + 1, plan.length)
  }
  return result
}
