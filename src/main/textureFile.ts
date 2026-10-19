import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { isCtmProperties } from '../shared/ctm'
import { encodePng, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from '../shared/pngCodec'
import type { EditResult } from './editMcmeta'
import { isSafePackPath, type PackSource } from './packSource'

const READ_ONLY = 'I pack zip sono in sola lettura: estrai il pack in una cartella.'
const BAD_PATH = 'Percorso della texture non valido.'
export const MAX_MCMETA_BYTES = 1024 * 1024

/**
 * Writes editor pixels (straight RGBA8 from the renderer, untrusted) as a PNG inside a folder
 * pack. Missing folders are created (new textures); the file is replaced atomically.
 */
export async function saveTexture(
  source: PackSource,
  path: unknown,
  width: unknown,
  height: unknown,
  rgba: unknown
): Promise<EditResult> {
  if (source.kind !== 'folder') return { ok: false, error: READ_ONLY }
  if (!isPngPath(path)) return { ok: false, error: BAD_PATH }
  if (!isSide(width) || !isSide(height) || width * height > MAX_IMAGE_PIXELS) {
    return { ok: false, error: 'Dimensioni della texture non valide.' }
  }
  if (!(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) {
    return { ok: false, error: 'Dati della texture non validi.' }
  }
  return writeInPack(source.root, path, encodePng({ width, height, data: rgba }), 'la texture')
}

/**
 * Writes (or with null deletes) the `.png.mcmeta` next to a texture. `pngPath` is the texture's
 * path; the content must be a JSON object (the renderer builds it, main re-checks it).
 */
export async function saveTextureMcmeta(
  source: PackSource,
  pngPath: unknown,
  content: unknown
): Promise<EditResult> {
  if (source.kind !== 'folder') return { ok: false, error: READ_ONLY }
  if (!isPngPath(pngPath)) return { ok: false, error: BAD_PATH }
  const path = `${pngPath}.mcmeta`
  if (content === null) {
    try {
      const file = await containedFile(source.root, path)
      if (!file) return { ok: false, error: BAD_PATH }
      await rm(file, { force: true })
      return { ok: true }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `Impossibile eliminare il file .mcmeta: ${detail}` }
    }
  }
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_MCMETA_BYTES) {
    return { ok: false, error: 'Contenuto del file .mcmeta non valido.' }
  }
  try {
    const parsed: unknown = JSON.parse(content)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
  } catch {
    return { ok: false, error: 'Il file .mcmeta deve contenere un oggetto JSON.' }
  }
  return writeInPack(source.root, path, Buffer.from(content, 'utf8'), 'il file .mcmeta')
}

export const MAX_PROPERTIES_BYTES = 64 * 1024

/**
 * Writes a CTM `.properties` (text) under `assets/<namespace>/optifine/ctm/`, the only place the
 * game and Continuity read them from.
 */
export async function saveCtmProperties(
  source: PackSource,
  path: unknown,
  content: unknown
): Promise<EditResult> {
  if (source.kind !== 'folder') return { ok: false, error: READ_ONLY }
  if (typeof path !== 'string' || !isSafePackPath(path) || !isCtmProperties(path)) {
    return { ok: false, error: 'Percorso del file .properties non valido.' }
  }
  if (
    typeof content !== 'string' ||
    Buffer.byteLength(content) > MAX_PROPERTIES_BYTES ||
    content.includes('\0')
  ) {
    return { ok: false, error: 'Contenuto del file .properties non valido.' }
  }
  return writeInPack(source.root, path, Buffer.from(content, 'utf8'), 'il file .properties')
}

/** Atomic write of a pack file, refusing paths that leave the pack (also via links). */
/** Atomic write of any file of a folder pack (restoring backups); `path` must be safe. */
export async function writePackBytes(
  packRoot: string,
  path: string,
  bytes: Uint8Array
): Promise<EditResult> {
  if (!isSafePackPath(path)) return { ok: false, error: BAD_PATH }
  return writeInPack(packRoot, path, bytes, 'il file')
}

async function writeInPack(
  packRoot: string,
  path: string,
  bytes: Uint8Array,
  what: string
): Promise<EditResult> {
  try {
    const root = await realpath(packRoot)
    const file = resolve(root, ...path.split('/'))
    // Folders may be symlinks/junctions: check where the deepest existing one really is BEFORE
    // creating anything, then again after (in case of a race).
    if (!isInside(root, await realpath(await deepestExisting(dirname(file))))) {
      return { ok: false, error: BAD_PATH }
    }
    await mkdir(dirname(file), { recursive: true })
    if (!isInside(root, await realpath(dirname(file)))) return { ok: false, error: BAD_PATH }
    const temp = `${file}.tmp`
    await writeFile(temp, bytes)
    try {
      await renameRetrying(temp, file)
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
    return { ok: true }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const locked = isLockError(error)
    return {
      ok: false,
      error: locked
        ? `Impossibile salvare ${what}: il file è bloccato da un altro programma (editor esterno, antivirus?). Chiudilo lì e riprova.`
        : `Impossibile salvare ${what}: ${detail}`
    }
  }
}

/** Codes Windows gives while another process briefly holds the file (scanner, editor, indexer). */
function isLockError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
}

/** Waits between rename attempts: about 2.5 s in all, then the lock is reported. */
export const RENAME_RETRY_MS = [20, 50, 100, 200, 400, 700, 1000] as const

/** rename, retried while the target is locked (as graceful-fs does on Windows). */
export async function renameRetrying(
  from: string,
  to: string,
  doRename: (from: string, to: string) => Promise<void> = rename
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await doRename(from, to)
      return
    } catch (error) {
      const wait = RENAME_RETRY_MS[attempt]
      if (!isLockError(error) || wait === undefined) throw error
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

/** Absolute path of an existing-folder pack file, or null if its folder lies outside the pack. */
async function containedFile(packRoot: string, path: string): Promise<string | null> {
  const root = await realpath(packRoot)
  const file = resolve(root, ...path.split('/'))
  return isInside(root, await realpath(await deepestExisting(dirname(file)))) ? file : null
}

/**
 * Absolute path of an existing PNG of a folder pack, for another program to open; null when the
 * path is unsafe, leaves the pack (also via links) or the file does not exist.
 */
export async function packPngFile(source: PackSource, path: unknown): Promise<string | null> {
  if (source.kind !== 'folder' || !isPngPath(path)) return null
  try {
    const root = await realpath(source.root)
    const file = await realpath(resolve(root, ...path.split('/')))
    return isInside(root, file) ? file : null
  } catch {
    return null
  }
}

function isPngPath(path: unknown): path is string {
  return typeof path === 'string' && isSafePackPath(path) && path.toLowerCase().endsWith('.png')
}

async function deepestExisting(path: string): Promise<string> {
  for (let current = path; ; current = dirname(current)) {
    try {
      await realpath(current)
      return current
    } catch {
      if (dirname(current) === current) throw new Error('Cartella non trovata.')
    }
  }
}

function isSide(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_IMAGE_SIDE
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  // On another drive, relative() returns an absolute path.
  return rel === '' || (!isAbsolute(rel) && rel.split(sep)[0] !== '..')
}
