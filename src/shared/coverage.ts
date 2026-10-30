// Coverage report: which textures of the pack still miss their LabPBR maps. Pure.

import { mapKindOf } from './labpbr'
import { groupTextures, type TextureEntry } from './textures'

/** `textures/<folder>` where `_n` / `_s` make no sense (interface, palettes, sky…). */
export const NO_MAPS_FOLDERS: ReadonlySet<string> = new Set([
  'gui',
  'font',
  'colormap',
  'map',
  'mob_effect',
  'palettes',
  'environment',
  'misc',
  'effect'
])

export type Missing = 'both' | 'normal' | 'specular'

export interface FolderCoverage {
  /** `block`, `item`… (the folder under `textures/`; namespaces other than minecraft prefixed). */
  folder: string
  total: number
  both: number
  normalOnly: number
  specularOnly: number
  none: number
  /** Excluded from the totals by default (gui, font…). */
  skipped: boolean
}

export interface CoverageReport {
  folders: FolderCoverage[]
  /** Totals over the folders that are not skipped. */
  total: number
  complete: number
  /** Textures missing at least one map (not skipped), sorted by path. */
  missing: Array<{ texture: TextureEntry; missing: Missing }>
  /** `_n` / `_s` whose texture is not in the pack (maps for the game's textures). */
  gameMaps: number
}

/** `block` for `assets/minecraft/textures/block/x.png`, `mod:block` for other namespaces. */
export function coverageFolder(path: string): string | null {
  const match = /^assets\/([^/]+)\/textures\/([^/]+)\//.exec(path)
  if (!match) return null
  return match[1] === 'minecraft' ? match[2]! : `${match[1]}:${match[2]}`
}

/** `x_e.png` with `x.png` in the same folder: the OptiFine / Continuity emissive overlay. */
function isEmissiveOverlay(path: string, files: ReadonlySet<string>): boolean {
  return path.endsWith('_e.png') && files.has(path.slice(0, -'_e.png'.length) + '.png')
}

function folderName(folder: string): string {
  return folder.includes(':') ? folder.slice(folder.indexOf(':') + 1) : folder
}

export function coverageReport(packFiles: readonly string[]): CoverageReport {
  const byFolder = new Map<string, FolderCoverage>()
  const missing: CoverageReport['missing'] = []
  let gameMaps = 0
  const fileSet = new Set(packFiles)
  for (const texture of groupTextures(packFiles)) {
    const folder = coverageFolder(texture.albedo)
    if (!folder) continue
    // groupTextures lists a map without its texture as a texture of its own.
    if (mapKindOf(texture.albedo)) {
      gameMaps++
      continue
    }
    // An emissive overlay (glowstone_e next to glowstone) is drawn over its texture, not a
    // texture of its own: it never gets maps.
    if (isEmissiveOverlay(texture.albedo, fileSet)) continue
    let entry = byFolder.get(folder)
    if (!entry) {
      entry = {
        folder,
        total: 0,
        both: 0,
        normalOnly: 0,
        specularOnly: 0,
        none: 0,
        skipped: NO_MAPS_FOLDERS.has(folderName(folder))
      }
      byFolder.set(folder, entry)
    }
    entry.total++
    const n = texture.normal !== null
    const s = texture.specular !== null
    if (n && s) entry.both++
    else if (n) entry.normalOnly++
    else if (s) entry.specularOnly++
    else entry.none++
    if (!entry.skipped && !(n && s)) {
      missing.push({ texture, missing: !n && !s ? 'both' : n ? 'specular' : 'normal' })
    }
  }
  const folders = [...byFolder.values()].sort(
    (a, b) => Number(a.skipped) - Number(b.skipped) || b.total - a.total
  )
  const counted = folders.filter((f) => !f.skipped)
  missing.sort((a, b) => a.texture.albedo.localeCompare(b.texture.albedo))
  return {
    folders,
    total: counted.reduce((sum, f) => sum + f.total, 0),
    complete: counted.reduce((sum, f) => sum + f.both, 0),
    missing,
    gameMaps
  }
}
