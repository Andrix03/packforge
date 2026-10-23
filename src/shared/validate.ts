import { findRelease } from './packFormat'
import { tr } from './i18n'

export const PACK_NAME_MAX_LENGTH = 64
export const PACK_DESCRIPTION_MAX_LENGTH = 256

// Control characters are intentionally matched: Windows forbids them in file names.
// eslint-disable-next-line no-control-regex
const INVALID_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** Validates a pack name used as a folder name. Returns an Italian error, or null if valid. */
export function validatePackName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return tr('Il nome è obbligatorio.')
  if (trimmed.length > PACK_NAME_MAX_LENGTH) {
    return tr('Il nome può avere al massimo {0} caratteri.', PACK_NAME_MAX_LENGTH)
  }
  if (INVALID_NAME_CHARS.test(trimmed)) {
    return tr('Il nome non può contenere i caratteri < > : " / \\ | ? *')
  }
  if (trimmed.endsWith('.')) return tr('Il nome non può terminare con un punto.')
  if (trimmed === '.' || trimmed === '..' || WINDOWS_RESERVED_NAMES.test(trimmed)) {
    return tr('Questo nome è riservato da Windows.')
  }
  return null
}

export function validatePackDescription(description: string): string | null {
  if (description.length > PACK_DESCRIPTION_MAX_LENGTH) {
    return tr('La descrizione può avere al massimo {0} caratteri.', PACK_DESCRIPTION_MAX_LENGTH)
  }
  return null
}

export interface CreatePackRequest {
  parentDir: string
  name: string
  description: string
  gameVersion: string
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Parses untrusted IPC input for `pack:create`. Name is returned trimmed. */
export function parseCreatePackRequest(input: unknown): ParseResult<CreatePackRequest> {
  if (typeof input !== 'object' || input === null) return fail(tr('Richiesta non valida.'))
  const { parentDir, name, description, gameVersion } = input as Record<string, unknown>
  if (
    typeof parentDir !== 'string' ||
    typeof name !== 'string' ||
    typeof description !== 'string' ||
    typeof gameVersion !== 'string'
  ) {
    return fail(tr('Richiesta non valida.'))
  }
  if (parentDir.trim().length === 0) return fail(tr('Scegli una cartella di destinazione.'))
  const error = validatePackName(name) ?? validatePackDescription(description)
  if (error) return fail(error)
  if (!findRelease(gameVersion))
    return fail(tr('Versione di Minecraft non supportata: {0}', gameVersion))
  return { ok: true, value: { parentDir, name: name.trim(), description, gameVersion } }
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}
