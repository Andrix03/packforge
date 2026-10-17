import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { CreatePackResult } from '../shared/ipc'
import { buildPackMcmeta, serializeMcmeta } from '../shared/mcmeta'
import { findRelease } from '../shared/packFormat'
import { parseCreatePackRequest } from '../shared/validate'

/** Creates `<parentDir>/<name>/` with pack.mcmeta and the vanilla texture folder. */
export async function createPack(input: unknown): Promise<CreatePackResult> {
  const parsed = parseCreatePackRequest(input)
  if (!parsed.ok) return parsed
  const { parentDir, name, description, gameVersion } = parsed.value

  if (!isAbsolute(parentDir)) return { ok: false, error: 'Percorso di destinazione non valido.' }
  try {
    if (!(await stat(parentDir)).isDirectory()) {
      return { ok: false, error: 'La destinazione non è una cartella.' }
    }
  } catch {
    return { ok: false, error: 'La cartella di destinazione non esiste.' }
  }

  // Validated by parseCreatePackRequest.
  const release = findRelease(gameVersion)
  if (!release) return { ok: false, error: `Versione di Minecraft non supportata: ${gameVersion}` }

  const packDir = join(parentDir, name)
  try {
    await mkdir(packDir)
  } catch (error) {
    if (isErrnoCode(error, 'EEXIST')) {
      return { ok: false, error: `Esiste già una cartella "${name}" in questa posizione.` }
    }
    return { ok: false, error: `Impossibile creare la cartella: ${errorMessage(error)}` }
  }

  try {
    await mkdir(join(packDir, 'assets', 'minecraft', 'textures'), { recursive: true })
    const mcmeta = buildPackMcmeta(description, release.resourceFormat)
    await writeFile(join(packDir, 'pack.mcmeta'), serializeMcmeta(mcmeta), 'utf8')
  } catch (error) {
    // Only remove the folder we just created, never a pre-existing one.
    await rm(packDir, { recursive: true, force: true })
    return { ok: false, error: `Impossibile scrivere il pack: ${errorMessage(error)}` }
  }

  return { ok: true, path: packDir }
}

function isErrnoCode(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
