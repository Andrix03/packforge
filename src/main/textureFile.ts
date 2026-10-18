import { mkdir, realpath, rename, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { encodePng, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from '../shared/pngCodec'
import type { EditResult } from './editMcmeta'
import { isSafePackPath, type PackSource } from './packSource'

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
  if (source.kind !== 'folder') {
    return { ok: false, error: 'I pack zip sono in sola lettura: estrai il pack in una cartella.' }
  }
  if (typeof path !== 'string' || !isSafePackPath(path) || !path.toLowerCase().endsWith('.png')) {
    return { ok: false, error: 'Percorso della texture non valido.' }
  }
  if (!isSide(width) || !isSide(height) || width * height > MAX_IMAGE_PIXELS) {
    return { ok: false, error: 'Dimensioni della texture non valide.' }
  }
  if (!(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) {
    return { ok: false, error: 'Dati della texture non validi.' }
  }

  try {
    const root = await realpath(source.root)
    const file = resolve(root, ...path.split('/'))
    // Folders may be symlinks/junctions: check where the deepest existing one really is BEFORE
    // creating anything, then again after (in case of a race).
    if (!isInside(root, await realpath(await deepestExisting(dirname(file))))) {
      return { ok: false, error: 'Percorso della texture non valido.' }
    }
    await mkdir(dirname(file), { recursive: true })
    if (!isInside(root, await realpath(dirname(file)))) {
      return { ok: false, error: 'Percorso della texture non valido.' }
    }
    const temp = `${file}.tmp`
    await writeFile(temp, encodePng({ width, height, data: rgba }))
    await rename(temp, file)
    return { ok: true }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Impossibile salvare la texture: ${detail}` }
  }
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
