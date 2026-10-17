import { MODERN_FORMAT_MIN_MAJOR, type PackVersion } from './packFormat'

/** A format as written in pack.mcmeta: `74` means `[74, 0]` (or any minor, for max_format). */
export type McmetaFormat = number | [number, number]

export interface PackMcmeta {
  pack: {
    description: string
    pack_format?: number
    min_format?: McmetaFormat
    max_format?: McmetaFormat
  }
}

/**
 * Builds pack.mcmeta for a pack targeting a single resource format.
 * Formats >= 65 use `min_format`/`max_format` (accepting any later minor of the
 * same major); older ones use the legacy `pack_format` field only.
 */
export function buildPackMcmeta(description: string, format: PackVersion): PackMcmeta {
  if (format.major < MODERN_FORMAT_MIN_MAJOR) {
    return { pack: { description, pack_format: format.major } }
  }
  const minFormat: McmetaFormat = format.minor === 0 ? format.major : [format.major, format.minor]
  return { pack: { description, min_format: minFormat, max_format: format.major } }
}

export function serializeMcmeta(mcmeta: PackMcmeta): string {
  return `${JSON.stringify(mcmeta, null, 2)}\n`
}
