import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { unzipSync } from 'fflate'

/**
 * Where an opened pack lives. Zip packs keep their bytes in memory; `overlay` adds or replaces
 * files of a zip (the vanilla jar gets the launcher-downloaded textures, e.g. the panorama).
 */
export type PackSource =
  | { kind: 'folder'; root: string }
  | { kind: 'zip'; root: string; data: Uint8Array; overlay?: ReadonlyMap<string, Uint8Array> }

export const MAX_LISTED_FILES = 50_000
/** Files the renderer may read, with their type and size cap. */
const SERVED_TYPES: Array<{ suffix: string; contentType: string; maxBytes: number }> = [
  { suffix: '.png', contentType: 'image/png', maxBytes: 16 * 1024 * 1024 },
  { suffix: '.mcmeta', contentType: 'application/json', maxBytes: 1024 * 1024 },
  // Block models and block states for the 3D preview.
  { suffix: '.json', contentType: 'application/json', maxBytes: 1024 * 1024 },
  // Connected textures (optifine/ctm/**.properties) for the Test scenes.
  { suffix: '.properties', contentType: 'text/plain; charset=utf-8', maxBytes: 64 * 1024 }
]

export interface PackAsset {
  bytes: Uint8Array
  contentType: string
}

export interface PackFileList {
  /** Posix-style paths relative to the pack root, sorted. */
  files: string[]
  truncated: boolean
}

/**
 * A pack-relative path that is safe to resolve: posix separators, no empty,
 * `.` or `..` segments, not absolute, no NUL or backslash.
 */
export function isSafePackPath(path: string): boolean {
  // ':' is never part of a resource location; on Windows it means a drive (C:) or an NTFS stream.
  if (path.length === 0 || path.startsWith('/') || /[\\\0:]/.test(path)) return false
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/** Lists files; with `prefixes`, only paths starting with one of them. */
export async function listPackFiles(
  source: PackSource,
  prefixes: readonly string[] = ['']
): Promise<PackFileList> {
  const wanted = (path: string): boolean => prefixes.some((prefix) => path.startsWith(prefix))
  const files: string[] = []
  let truncated = false

  if (source.kind === 'zip') {
    // filter returns false for everything: only the central directory is read.
    unzipSync(source.data, {
      filter: (file) => {
        if (file.name.endsWith('/') || !wanted(file.name)) return false
        if (!isSafePackPath(file.name)) return false
        if (files.length < MAX_LISTED_FILES) files.push(file.name)
        else truncated = true
        return false
      }
    })
    for (const name of source.overlay?.keys() ?? []) {
      if (wanted(name) && !files.includes(name) && files.length < MAX_LISTED_FILES) files.push(name)
    }
  } else {
    const pending = ['']
    while (pending.length > 0 && !truncated) {
      const dir = pending.pop() as string
      const entries = await readdir(join(source.root, dir), { withFileTypes: true })
      for (const entry of entries) {
        // Symlinks are skipped so listing never leaves the pack folder.
        const path = dir === '' ? entry.name : `${dir}/${entry.name}`
        if (entry.isDirectory()) pending.push(path)
        else if (entry.isFile() && wanted(path)) {
          if (files.length >= MAX_LISTED_FILES) {
            truncated = true
            break
          }
          files.push(path)
        }
      }
    }
  }

  files.sort()
  return { files, truncated }
}

/**
 * Reads a PNG or .mcmeta inside the pack, or null if the path is unsafe, of
 * another type, missing or too big.
 */
export async function readPackAsset(source: PackSource, path: string): Promise<PackAsset | null> {
  const type = SERVED_TYPES.find((t) => path.toLowerCase().endsWith(t.suffix))
  if (!type || !isSafePackPath(path)) return null
  const bytes = await readBytes(source, path, type.maxBytes)
  return bytes ? { bytes, contentType: type.contentType } : null
}

async function readBytes(
  source: PackSource,
  path: string,
  maxBytes: number
): Promise<Uint8Array | null> {
  if (source.kind === 'zip') {
    const overlaid = source.overlay?.get(path)
    if (overlaid) return overlaid.length <= maxBytes ? overlaid : null
    try {
      const entries = unzipSync(source.data, {
        filter: (file) => file.name === path && file.originalSize <= maxBytes
      })
      return entries[path] ?? null
    } catch {
      return null
    }
  }

  try {
    // realpath resolves symlinks, so a link pointing outside the pack is refused.
    const root = await realpath(source.root)
    const full = await realpath(resolve(root, ...path.split('/')))
    const rel = relative(root, full)
    // On another drive, relative() returns an absolute path.
    if (rel === '' || isAbsolute(rel) || rel.split(sep)[0] === '..') return null
    if ((await stat(full)).size > maxBytes) return null
    return await readFile(full)
  } catch {
    return null
  }
}
