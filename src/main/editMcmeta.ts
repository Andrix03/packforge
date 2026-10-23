import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { replaceFile, serializedOn } from './atomicWrite'
import type { PackSource } from './packSource'
import { tr } from '../shared/i18n'

// Edits pack.mcmeta in place: only the requested fields change, everything
// else (language, filter, overlays, unknown fields) is preserved.

export type EditResult = { ok: true } | { ok: false; error: string }

type PackObject = Record<string, unknown>

/**
 * Applies `change` to a folder pack's pack.mcmeta and writes it atomically.
 * `change` gets the `pack` object and the root object (for root sections
 * such as `overlays`). Zip packs are read-only. Edits of the same file run one at a time,
 * each reading what the previous one wrote (two edits at once never lose one).
 */
export function editPackObject(
  source: PackSource,
  change: (pack: PackObject, root: PackObject) => void
): Promise<EditResult> {
  if (source.kind !== 'folder') {
    return Promise.resolve({
      ok: false,
      error: tr('I pack zip sono in sola lettura: estrai il pack in una cartella.')
    })
  }
  const file = join(source.root, 'pack.mcmeta')
  return serializedOn(file, () => editFile(file, change))
}

async function editFile(
  file: string,
  change: (pack: PackObject, root: PackObject) => void
): Promise<EditResult> {
  let root: unknown
  try {
    root = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  } catch {
    return {
      ok: false,
      error: tr('pack.mcmeta non è un JSON valido: correggilo prima di modificarlo.')
    }
  }
  const pack = isRecord(root) ? root['pack'] : undefined
  if (!isRecord(root) || !isRecord(pack)) {
    return { ok: false, error: tr('Manca la sezione "pack" in pack.mcmeta.') }
  }

  change(pack, root)

  try {
    await replaceFile(file, `${JSON.stringify(root, null, 2)}\n`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { ok: false, error: tr('Impossibile salvare pack.mcmeta: {0}', detail) }
  }
  return { ok: true }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
