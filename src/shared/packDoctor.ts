import { tr } from './i18n'
// Pack Doctor (Phase 17 logic): what changed between two game versions, how to port a pack's
// files across a rename, and file names the game silently ignores. Pure: main reads the jars and
// hashes the decoded pixels; nothing from a jar is ever copied into a pack.

/** Pixel hashes of the textures of one game version: pack path → hash of the decoded RGBA. */
export type TextureHashes = ReadonlyMap<string, string>

export interface TextureDiff {
  added: string[]
  removed: string[]
  /** Same pixels under a new path (one-to-one matches only). */
  renamed: Array<{ from: string; to: string }>
  /** Same path, different pixels (the game redrew it). */
  changed: string[]
}

/** Compares the textures of an older and a newer version. */
export function diffTextures(before: TextureHashes, after: TextureHashes): TextureDiff {
  const removed = [...before.keys()].filter((path) => !after.has(path))
  const added = [...after.keys()].filter((path) => !before.has(path))
  const changed = [...before.keys()].filter(
    (path) => after.has(path) && after.get(path) !== before.get(path)
  )
  // A rename is a removed and an added texture with the same pixels, and no other candidate
  // on either side (blank or repeated images are ambiguous: left as removed + added).
  const byHash = (paths: string[], hashes: TextureHashes): Map<string, string[]> => {
    const out = new Map<string, string[]>()
    for (const path of paths) {
      const hash = hashes.get(path)!
      out.set(hash, [...(out.get(hash) ?? []), path])
    }
    return out
  }
  const gone = byHash(removed, before)
  const fresh = byHash(added, after)
  const renamed: Array<{ from: string; to: string }> = []
  for (const [hash, from] of gone) {
    const to = fresh.get(hash)
    if (from.length === 1 && to?.length === 1) renamed.push({ from: from[0]!, to: to[0]! })
  }
  const renamedFrom = new Set(renamed.map((r) => r.from))
  const renamedTo = new Set(renamed.map((r) => r.to))
  return {
    added: added.filter((path) => !renamedTo.has(path)).sort(),
    removed: removed.filter((path) => !renamedFrom.has(path)).sort(),
    renamed: renamed.sort((a, b) => a.from.localeCompare(b.from)),
    changed: changed.sort()
  }
}

export interface RenameStep {
  from: string
  to: string
}

/**
 * The pack files to move for `renames`: each texture with its LabPBR maps and .png.mcmeta files.
 * A step whose target already exists in the pack is left out (never overwrite) and reported.
 */
export function renamePlan(
  packFiles: ReadonlySet<string>,
  renames: ReadonlyArray<{ from: string; to: string }>
): { steps: RenameStep[]; blocked: RenameStep[] } {
  const steps: RenameStep[] = []
  const blocked: RenameStep[] = []
  for (const { from, to } of renames) {
    const base = from.slice(0, -'.png'.length)
    const next = to.slice(0, -'.png'.length)
    for (const suffix of ['.png', '_n.png', '_s.png']) {
      for (const extra of ['', '.mcmeta']) {
        const source = `${base}${suffix}${extra}`
        if (!packFiles.has(source)) continue
        const step = { from: source, to: `${next}${suffix}${extra}` }
        ;(packFiles.has(step.to) ? blocked : steps).push(step)
      }
    }
  }
  return { steps, blocked }
}

/** Game textures the pack does not replace, grouped by folder (e.g. "block", "item"). */
export function missingTextures(
  game: Iterable<string>,
  packFiles: ReadonlySet<string>
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const path of game) {
    if (packFiles.has(path) || !path.endsWith('.png')) continue
    const match = /^assets\/[^/]+\/textures\/([^/]+)\//.exec(path)
    const folder = match?.[1] ?? 'altro'
    out.set(folder, [...(out.get(folder) ?? []), path])
  }
  for (const list of out.values()) list.sort()
  return out
}

export interface PathIssue {
  path: string
  message: string
}

/** Folders renamed in 1.13 ("The Flattening"): files still there are never read. */
const LEGACY_FOLDERS: Record<string, string> = {
  'textures/blocks/': 'textures/block/',
  'textures/items/': 'textures/item/',
  'models/blocks/': 'models/block/',
  'models/items/': 'models/item/'
}

/**
 * Pack files the game skips without saying so: resource paths may only use a–z, 0–9 and
 * `_ - . /` (a capital letter or a space makes the file invisible), old 1.12 folder names, and
 * files of `assets/` outside any namespace folder.
 */
export function lintPaths(files: Iterable<string>): PathIssue[] {
  const issues: PathIssue[] = []
  for (const path of files) {
    if (!path.startsWith('assets/')) continue
    const parts = path.split('/')
    // Hidden files (.DS_Store, markers) are not resources: the export leaves them out anyway.
    if (parts.at(-1)!.startsWith('.')) continue
    if (parts.length < 3) {
      issues.push({
        path,
        message: tr('Fuori da una cartella namespace (assets/<namespace>/…): ignorato.')
      })
      continue
    }
    const inside = parts.slice(1).join('/')
    if (/[A-Z]/.test(inside)) {
      issues.push({
        path,
        message: tr('Lettere maiuscole nel percorso: il gioco non vede il file (solo minuscole).')
      })
    } else if (/[^a-z0-9_.\-/]/.test(inside)) {
      issues.push({
        path,
        message: tr(
          'Caratteri non ammessi (spazi, accenti…): il gioco ignora il file. Usa a–z, 0–9, _ - .'
        )
      })
    }
    const rest = parts.slice(2).join('/')
    for (const [old, now] of Object.entries(LEGACY_FOLDERS)) {
      if (rest.startsWith(old)) {
        issues.push({
          path,
          message: tr('Cartella "{0}" delle versioni prima della 1.13: ora è "{1}".', old, now)
        })
      }
    }
  }
  return issues
}
