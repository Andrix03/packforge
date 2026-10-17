import type { McmetaFormat } from './mcmeta'
import {
  comparePackVersions,
  findRelease,
  MODERN_FORMAT_MIN_MAJOR,
  SUPPORTED_FORMATS_MIN_MAJOR,
  type GameRelease,
  type PackVersion
} from './packFormat'

// Writing multi-version packs (rules from snapshot 25w31a):
// - formats >= 65 are declared with min_format/max_format;
// - pack_format + supported_formats are required when older formats are
//   supported, and forbidden otherwise;
// - overlay entries need min_format/max_format, plus `formats` on every entry
//   as soon as one overlay reaches below 65.

export interface FormatFields {
  pack_format?: number
  supported_formats?: [number, number]
  min_format?: McmetaFormat
  max_format?: McmetaFormat
}

const FORMAT_KEYS = ['pack_format', 'supported_formats', 'min_format', 'max_format'] as const

/** The pack.mcmeta format fields for a pack supporting formats `min`..`max`. */
export function formatFieldsForRange(min: PackVersion, max: PackVersion): FormatFields {
  const fields: FormatFields = {}
  if (min.major < MODERN_FORMAT_MIN_MAJOR) {
    // Releases before 1.20.2 only read pack_format, so it is the lowest format.
    fields.pack_format = min.major
    if (max.major >= SUPPORTED_FORMATS_MIN_MAJOR && max.major !== min.major) {
      fields.supported_formats = [min.major, max.major]
    }
  }
  if (max.major >= MODERN_FORMAT_MIN_MAJOR) {
    fields.min_format = toMcmetaFormat(min)
    // A bare major accepts every later minor of it.
    fields.max_format = max.major
  }
  return fields
}

/** Replaces the four format fields of a `pack` object; fields not in `fields` are removed. */
export function applyFormatFields(pack: Record<string, unknown>, fields: FormatFields): void {
  for (const key of FORMAT_KEYS) {
    if (fields[key] === undefined) delete pack[key]
    else pack[key] = fields[key]
  }
}

export interface OverlaySpec {
  directory: string
  min: PackVersion
  max: PackVersion
}

export interface OverlayEntry {
  directory: string
  min_format: McmetaFormat
  max_format: McmetaFormat
  formats?: [number, number]
}

export function buildOverlayEntries(specs: readonly OverlaySpec[]): OverlayEntry[] {
  const needsFormats = specs.some((spec) => spec.min.major < MODERN_FORMAT_MIN_MAJOR)
  return specs.map((spec) => ({
    directory: spec.directory,
    min_format: toMcmetaFormat(spec.min),
    max_format: spec.max.major,
    ...(needsFormats ? { formats: [spec.min.major, spec.max.major] as [number, number] } : {})
  }))
}

/**
 * Overlay folder names. The wiki's format section allows `a-z0-9_-.` while its
 * history mentions upper case too; the stricter set is used.
 */
export function validateOverlayDirectory(name: string): string | null {
  if (name.length === 0) return 'Il nome della cartella overlay è obbligatorio.'
  if (!/^[a-z0-9_.-]+$/.test(name)) {
    return 'Cartella overlay: usa solo lettere minuscole, numeri, "_", "-" e ".".'
  }
  if (name === '.' || name === '..') return 'Nome della cartella overlay non valido.'
  if (name === 'assets' || name === 'data') {
    return `"${name}" è già una cartella del pack: scegli un altro nome.`
  }
  return null
}

export interface VersionRangeRequest {
  minVersion: string
  maxVersion: string
  overlays: Array<{ directory: string; minVersion: string; maxVersion: string }>
}

export interface ResolvedVersionRange {
  min: GameRelease
  max: GameRelease
  overlays: OverlaySpec[]
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/** Validates untrusted input for `pack:updateVersions`. */
export function parseVersionRangeRequest(input: unknown): ParseResult<ResolvedVersionRange> {
  if (typeof input !== 'object' || input === null) return fail('Richiesta non valida.')
  const { minVersion, maxVersion, overlays } = input as Record<string, unknown>
  const range = resolveRange(minVersion, maxVersion, 'del pack')
  if (!range.ok) return range
  if (!Array.isArray(overlays)) return fail('Richiesta non valida.')

  const specs: OverlaySpec[] = []
  const seen = new Set<string>()
  for (const overlay of overlays) {
    if (typeof overlay !== 'object' || overlay === null) return fail('Overlay non valido.')
    const { directory, minVersion: oMin, maxVersion: oMax } = overlay as Record<string, unknown>
    if (typeof directory !== 'string') return fail('Overlay non valido.')
    const invalid = validateOverlayDirectory(directory)
    if (invalid) return fail(invalid)
    if (seen.has(directory)) return fail(`La cartella overlay "${directory}" è ripetuta.`)
    seen.add(directory)
    const overlayRange = resolveRange(oMin, oMax, `dell'overlay "${directory}"`)
    if (!overlayRange.ok) return overlayRange
    specs.push({
      directory,
      min: overlayRange.value.min.resourceFormat,
      max: overlayRange.value.max.resourceFormat
    })
  }
  return { ok: true, value: { ...range.value, overlays: specs } }
}

function resolveRange(
  minVersion: unknown,
  maxVersion: unknown,
  what: string
): ParseResult<{ min: GameRelease; max: GameRelease }> {
  const min = typeof minVersion === 'string' ? findRelease(minVersion) : undefined
  const max = typeof maxVersion === 'string' ? findRelease(maxVersion) : undefined
  if (!min || !max) return fail(`Versioni ${what} non valide.`)
  if (comparePackVersions(min.resourceFormat, max.resourceFormat) > 0) {
    return fail(`La versione minima ${what} è più recente della massima.`)
  }
  return { ok: true, value: { min, max } }
}

function toMcmetaFormat(version: PackVersion): McmetaFormat {
  return version.minor === 0 ? version.major : [version.major, version.minor]
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/** Oldest and newest of a list of releases (as found in GAME_RELEASES order). */
export function releaseSpan(
  releases: readonly GameRelease[]
): { minVersion: string; maxVersion: string } | null {
  const newest = releases[0]
  const oldest = releases.at(-1)
  return newest && oldest ? { minVersion: oldest.version, maxVersion: newest.version } : null
}
