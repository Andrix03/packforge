import {
  ANY_MINOR,
  comparePackVersions,
  GAME_RELEASES,
  MODERN_FORMAT_MIN_MAJOR,
  SUPPORTED_FORMATS_MIN_MAJOR,
  type GameRelease,
  type PackVersion
} from './packFormat'

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

// ---------------------------------------------------------------------------
// Reading existing packs
// ---------------------------------------------------------------------------

export type IssueSeverity = 'error' | 'warning'

export interface PackIssue {
  severity: IssueSeverity
  message: string
}

/** Format declarations found in pack.mcmeta, normalized. Null when absent or invalid. */
export interface PackFormats {
  packFormat: number | null
  supportedFormats: { min: number; max: number } | null
  /** From `min_format`/`max_format` (25w31a+). */
  range: { min: PackVersion; max: PackVersion } | null
}

export interface McmetaAnalysis {
  /**
   * Description text. For a plain string this is the string itself (with any
   * `§` codes); for a JSON text component it is the flattened plain text.
   */
  description: string
  descriptionKind: 'string' | 'component' | 'missing'
  formats: PackFormats
  issues: PackIssue[]
}

const NO_FORMATS: PackFormats = { packFormat: null, supportedFormats: null, range: null }

/** Parses and validates pack.mcmeta text. Never throws: problems become issues. */
export function analyzePackMcmeta(text: string): McmetaAnalysis {
  const issues: PackIssue[] = []
  const error = (message: string): void => void issues.push({ severity: 'error', message })
  const warning = (message: string): void => void issues.push({ severity: 'warning', message })

  let root: unknown
  try {
    root = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    error(`pack.mcmeta non è un JSON valido: ${detail}`)
    return { description: '', descriptionKind: 'missing', formats: NO_FORMATS, issues }
  }

  const pack = isRecord(root) ? root['pack'] : undefined
  if (!isRecord(pack)) {
    error('Manca la sezione "pack" in pack.mcmeta.')
    return { description: '', descriptionKind: 'missing', formats: NO_FORMATS, issues }
  }

  let description = ''
  let descriptionKind: McmetaAnalysis['descriptionKind'] = 'missing'
  if (pack['description'] === undefined) warning('Manca la descrizione ("description").')
  else {
    description = textComponentToPlain(pack['description'])
    descriptionKind = typeof pack['description'] === 'string' ? 'string' : 'component'
  }

  // pack_format
  let packFormat: number | null = null
  if (pack['pack_format'] !== undefined) {
    if (isFormatInt(pack['pack_format'])) packFormat = pack['pack_format']
    else error('"pack_format" deve essere un numero intero non negativo.')
  }

  // supported_formats
  let supportedFormats: PackFormats['supportedFormats'] = null
  if (pack['supported_formats'] !== undefined) {
    supportedFormats = parseSupportedFormats(pack['supported_formats'])
    if (!supportedFormats) {
      error(
        '"supported_formats" non valido: usa un intero, [min, max] o {min_inclusive, max_inclusive}.'
      )
    } else if (supportedFormats.min > supportedFormats.max) {
      error('"supported_formats": il minimo è maggiore del massimo.')
      supportedFormats = null
    }
  }

  // min_format / max_format
  let range: PackFormats['range'] = null
  const hasMin = pack['min_format'] !== undefined
  const hasMax = pack['max_format'] !== undefined
  if (hasMin !== hasMax) {
    error('"min_format" e "max_format" vanno specificati insieme.')
  } else if (hasMin && hasMax) {
    const min = parseFormatVersion(pack['min_format'], 0)
    const max = parseFormatVersion(pack['max_format'], ANY_MINOR)
    if (!min) error('"min_format" non valido: usa un intero o [maggiore, minore].')
    if (!max) error('"max_format" non valido: usa un intero o [maggiore, minore].')
    if (min && max) {
      if (comparePackVersions(min, max) > 0) error('"min_format" è maggiore di "max_format".')
      else range = { min, max }
    }
  }

  // Cross-field rules (25w31a): legacy fields are required when supporting
  // formats below 65 and forbidden otherwise.
  if (pack['pack_format'] === undefined && !hasMin && !hasMax) {
    error('Manca il formato del pack: serve "pack_format" oppure "min_format"/"max_format".')
  }
  if (range) {
    const supportsLegacy = range.min.major < MODERN_FORMAT_MIN_MAJOR
    if (supportsLegacy && pack['pack_format'] === undefined) {
      error('Per supportare versioni precedenti alla 1.21.9 serve anche "pack_format".')
    }
    if (supportsLegacy && pack['supported_formats'] === undefined) {
      warning('Per supportare versioni precedenti alla 1.21.9 serve anche "supported_formats".')
    }
    if (!supportsLegacy && pack['supported_formats'] !== undefined) {
      error(
        '"supported_formats" non è consentito se il pack supporta solo il formato 65 o successivi: va rimosso.'
      )
    }
  } else if (!hasMin && packFormat !== null && packFormat >= MODERN_FORMAT_MIN_MAJOR) {
    error(`Dal formato ${MODERN_FORMAT_MIN_MAJOR} (1.21.9+) servono "min_format" e "max_format".`)
  }
  if (packFormat !== null && supportedFormats) {
    if (packFormat < supportedFormats.min || packFormat > supportedFormats.max) {
      warning('"pack_format" è fuori dall\'intervallo di "supported_formats".')
    }
  }

  const formats: PackFormats = { packFormat, supportedFormats, range }
  if (
    !issues.some((issue) => issue.severity === 'error') &&
    compatibleReleases(formats).length === 0
  ) {
    warning('Nessuna versione di Minecraft gestita da PackForge (1.20 → 26.3) è compatibile.')
  }
  return { description, descriptionKind, formats, issues }
}

/**
 * Whether a release loads the pack without the "incompatible" warning, using the
 * fields that release actually reads.
 */
export function isCompatibleWith(formats: PackFormats, release: GameRelease): boolean {
  const format = release.resourceFormat
  if (format.major >= MODERN_FORMAT_MIN_MAJOR) {
    const { range } = formats
    return (
      range !== null &&
      comparePackVersions(range.min, format) <= 0 &&
      comparePackVersions(format, range.max) <= 0
    )
  }
  if (format.major >= SUPPORTED_FORMATS_MIN_MAJOR && formats.supportedFormats) {
    return (
      formats.supportedFormats.min <= format.major && format.major <= formats.supportedFormats.max
    )
  }
  return formats.packFormat === format.major
}

export function compatibleReleases(formats: PackFormats): GameRelease[] {
  return GAME_RELEASES.filter((release) => isCompatibleWith(formats, release))
}

/** Flattens a Minecraft text component (string, object or array) to plain text. */
export function textComponentToPlain(component: unknown): string {
  if (typeof component === 'string') return component
  if (typeof component === 'number' || typeof component === 'boolean') return String(component)
  if (Array.isArray(component)) return component.map(textComponentToPlain).join('')
  if (!isRecord(component)) return ''
  let text = ''
  if (typeof component['text'] === 'string') text = component['text']
  else if (typeof component['translate'] === 'string') {
    text =
      typeof component['fallback'] === 'string' ? component['fallback'] : component['translate']
  }
  if (Array.isArray(component['extra']))
    text += component['extra'].map(textComponentToPlain).join('')
  return text
}

function parseFormatVersion(value: unknown, defaultMinor: number): PackVersion | null {
  if (isFormatInt(value)) return { major: value, minor: defaultMinor }
  if (Array.isArray(value)) {
    if (value.length === 1 && isFormatInt(value[0])) return { major: value[0], minor: defaultMinor }
    if (value.length === 2 && isFormatInt(value[0]) && isFormatInt(value[1])) {
      return { major: value[0], minor: value[1] }
    }
  }
  return null
}

function parseSupportedFormats(value: unknown): { min: number; max: number } | null {
  if (isFormatInt(value)) return { min: value, max: value }
  if (Array.isArray(value)) {
    if (value.length === 1 && isFormatInt(value[0])) return { min: value[0], max: value[0] }
    if (value.length === 2 && isFormatInt(value[0]) && isFormatInt(value[1])) {
      return { min: value[0], max: value[1] }
    }
    return null
  }
  if (
    isRecord(value) &&
    isFormatInt(value['min_inclusive']) &&
    isFormatInt(value['max_inclusive'])
  ) {
    return { min: value['min_inclusive'], max: value['max_inclusive'] }
  }
  return null
}

function isFormatInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
