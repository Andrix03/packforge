// Resource pack format per Minecraft Java release.
// Source: https://minecraft.wiki/w/Pack_format and the per-release pages,
// verified 2026-10-17 (latest release: 26.3). Do not edit from memory —
// re-verify (ideally against `version.json` in the client jar) when adding versions.

export interface PackVersion {
  major: number
  minor: number
}

export interface GameRelease {
  version: string
  resourceFormat: PackVersion
}

/** First resource pack format using `min_format`/`max_format` (snapshot 25w31a). */
export const MODERN_FORMAT_MIN_MAJOR = 65

/** First resource pack format reading `supported_formats` (1.20.2). */
export const SUPPORTED_FORMATS_MIN_MAJOR = 18

/** Minor value meaning "any minor version" (a bare integer in `max_format`). */
export const ANY_MINOR = 0x7fffffff

// Newest first, so the first entry is the default target.
const FORMAT_GROUPS: ReadonlyArray<{ format: PackVersion; versions: readonly string[] }> = [
  { format: { major: 97, minor: 1 }, versions: ['26.3'] },
  { format: { major: 88, minor: 0 }, versions: ['26.2'] },
  { format: { major: 84, minor: 0 }, versions: ['26.1.2', '26.1.1', '26.1'] },
  { format: { major: 75, minor: 0 }, versions: ['1.21.11'] },
  { format: { major: 69, minor: 0 }, versions: ['1.21.10', '1.21.9'] },
  { format: { major: 64, minor: 0 }, versions: ['1.21.8', '1.21.7'] },
  { format: { major: 63, minor: 0 }, versions: ['1.21.6'] },
  { format: { major: 55, minor: 0 }, versions: ['1.21.5'] },
  { format: { major: 46, minor: 0 }, versions: ['1.21.4'] },
  { format: { major: 42, minor: 0 }, versions: ['1.21.3', '1.21.2'] },
  { format: { major: 34, minor: 0 }, versions: ['1.21.1', '1.21'] },
  { format: { major: 32, minor: 0 }, versions: ['1.20.6', '1.20.5'] },
  { format: { major: 22, minor: 0 }, versions: ['1.20.4', '1.20.3'] },
  { format: { major: 18, minor: 0 }, versions: ['1.20.2'] },
  { format: { major: 15, minor: 0 }, versions: ['1.20.1', '1.20'] }
]

export const GAME_RELEASES: readonly GameRelease[] = Object.freeze(
  FORMAT_GROUPS.flatMap(({ format, versions }) =>
    versions.map((version) => Object.freeze({ version, resourceFormat: Object.freeze(format) }))
  )
)

export const LATEST_RELEASE: GameRelease = GAME_RELEASES[0] as GameRelease

export function findRelease(version: string): GameRelease | undefined {
  return GAME_RELEASES.find((release) => release.version === version)
}

export function formatPackVersion({ major, minor }: PackVersion): string {
  return minor === ANY_MINOR ? `${major}.*` : `${major}.${minor}`
}

export function comparePackVersions(a: PackVersion, b: PackVersion): number {
  return a.major !== b.major ? a.major - b.major : a.minor - b.minor
}

/**
 * Groups compatible releases into contiguous spans of the supported list,
 * oldest first, e.g. ["1.20.5 – 1.21.1", "26.3"].
 */
export function summarizeReleaseSpans(compatible: readonly GameRelease[]): string[] {
  const wanted = new Set(compatible.map((release) => release.version))
  const spans: string[] = []
  let start: string | null = null
  let end: string | null = null
  const flush = (): void => {
    if (start !== null) spans.push(start === end ? start : `${start} – ${end}`)
    start = end = null
  }
  for (const { version } of [...GAME_RELEASES].reverse()) {
    if (wanted.has(version)) {
      start ??= version
      end = version
    } else {
      flush()
    }
  }
  flush()
  return spans
}
