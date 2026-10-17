import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PackSource } from './packSource'

// Edits pack.mcmeta in place: only the requested fields change, everything
// else (language, filter, overlays, unknown fields) is preserved.

export type EditResult = { ok: true } | { ok: false; error: string }

type PackObject = Record<string, unknown>

/**
 * Applies `change` to the `pack` object of a folder pack's pack.mcmeta and
 * writes the file atomically. Zip packs are read-only.
 */
export async function editPackObject(
  source: PackSource,
  change: (pack: PackObject) => void
): Promise<EditResult> {
  if (source.kind !== 'folder') {
    return { ok: false, error: 'I pack zip sono in sola lettura: estrai il pack in una cartella.' }
  }

  const file = join(source.root, 'pack.mcmeta')
  let root: unknown
  try {
    root = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  } catch {
    return {
      ok: false,
      error: 'pack.mcmeta non è un JSON valido: correggilo prima di modificarlo.'
    }
  }
  const pack = isRecord(root) ? root['pack'] : undefined
  if (!isRecord(root) || !isRecord(pack)) {
    return { ok: false, error: 'Manca la sezione "pack" in pack.mcmeta.' }
  }

  change(pack)

  try {
    const temp = `${file}.tmp`
    await writeFile(temp, `${JSON.stringify(root, null, 2)}\n`, 'utf8')
    await rename(temp, file)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Impossibile salvare pack.mcmeta: ${detail}` }
  }
  return { ok: true }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
