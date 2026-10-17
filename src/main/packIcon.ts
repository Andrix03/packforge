import { readFile, rename, stat, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { PickImageResult } from '../shared/ipc'
import { validatePackIcon } from '../shared/png'
import type { EditResult } from './editMcmeta'
import type { PackSource } from './packSource'

const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

export const ICON_IMAGE_EXTENSIONS = Object.keys(IMAGE_TYPES).map((ext) => ext.slice(1))

/** Reads a user-picked image for cropping in the renderer. */
export async function readIconSource(path: string): Promise<PickImageResult> {
  const type = IMAGE_TYPES[extname(path).toLowerCase()]
  if (!type) return { ok: false, error: 'Formato non supportato: usa PNG, JPG, WebP o GIF.' }
  try {
    if ((await stat(path)).size > MAX_SOURCE_IMAGE_BYTES) {
      return { ok: false, error: "L'immagine è troppo grande (massimo 20 MB)." }
    }
    const bytes = await readFile(path)
    const name = path.split(/[\\/]/).pop() ?? path
    return { ok: true, name, dataUrl: `data:${type};base64,${bytes.toString('base64')}` }
  } catch {
    return { ok: false, error: "Impossibile leggere l'immagine." }
  }
}

/** Validates base64 PNG data from the renderer and writes it as pack.png. */
export async function writePackIcon(source: PackSource, pngBase64: unknown): Promise<EditResult> {
  if (source.kind !== 'folder') {
    return { ok: false, error: 'I pack zip sono in sola lettura: estrai il pack in una cartella.' }
  }
  if (typeof pngBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(pngBase64)) {
    return { ok: false, error: 'Dati immagine non validi.' }
  }
  const bytes = Buffer.from(pngBase64, 'base64')
  const invalid = validatePackIcon(bytes)
  if (invalid) return { ok: false, error: invalid }

  const file = join(source.root, 'pack.png')
  try {
    const temp = `${file}.tmp`
    await writeFile(temp, bytes)
    await rename(temp, file)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Impossibile salvare pack.png: ${detail}` }
  }
  return { ok: true }
}
