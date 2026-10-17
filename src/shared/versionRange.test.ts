import { describe, expect, it } from 'vitest'
import { analyzePackMcmeta, compatibleReleases, isOverlayActive } from './mcmeta'
import { comparePackVersions, findRelease, GAME_RELEASES, type GameRelease } from './packFormat'
import {
  applyFormatFields,
  buildOverlayEntries,
  formatFieldsForRange,
  parseVersionRangeRequest,
  validateOverlayDirectory,
  type OverlaySpec
} from './versionRange'

const release = (version: string): GameRelease => {
  const found = findRelease(version)
  if (!found) throw new Error(version)
  return found
}
const format = (version: string) => release(version).resourceFormat

/** Releases whose format lies in [min, max], as the game would see them. */
const expectedBetween = (min: GameRelease, max: GameRelease): string[] =>
  GAME_RELEASES.filter(
    (r) =>
      comparePackVersions(min.resourceFormat, r.resourceFormat) <= 0 &&
      r.resourceFormat.major <= max.resourceFormat.major
  ).map((r) => r.version)

function analyzeWith(pack: Record<string, unknown>, root: Record<string, unknown> = {}) {
  return analyzePackMcmeta(JSON.stringify({ ...root, pack: { description: 'x', ...pack } }))
}

describe('formatFieldsForRange', () => {
  it('writes only min/max_format for modern-only ranges', () => {
    expect(formatFieldsForRange(format('1.21.9'), format('26.3'))).toEqual({
      min_format: 69,
      max_format: 97
    })
    expect(formatFieldsForRange(format('26.3'), format('26.3'))).toEqual({
      min_format: [97, 1],
      max_format: 97
    })
  })

  it('writes only legacy fields for legacy-only ranges', () => {
    expect(formatFieldsForRange(format('1.20'), format('1.20.1'))).toEqual({ pack_format: 15 })
    expect(formatFieldsForRange(format('1.20'), format('1.21.8'))).toEqual({
      pack_format: 15,
      supported_formats: [15, 64]
    })
  })

  it('writes all four fields for ranges crossing format 65', () => {
    expect(formatFieldsForRange(format('1.21'), format('26.3'))).toEqual({
      pack_format: 34,
      supported_formats: [34, 97],
      min_format: 34,
      max_format: 97
    })
  })

  // Every (min, max) pair: the written fields must be valid and compatible
  // with exactly the chosen releases, per the analyzer.
  it('round-trips through the analyzer for every pair of releases', () => {
    let checked = 0
    for (const min of GAME_RELEASES) {
      for (const max of GAME_RELEASES) {
        if (comparePackVersions(min.resourceFormat, max.resourceFormat) > 0) continue
        const fields = formatFieldsForRange(min.resourceFormat, max.resourceFormat)
        const analysis = analyzeWith({ ...fields })
        const context = `${min.version} → ${max.version}: ${JSON.stringify(fields)}`
        expect(analysis.issues, context).toEqual([])
        expect(
          compatibleReleases(analysis.formats).map((r) => r.version),
          context
        ).toEqual(expectedBetween(min, max))
        checked++
      }
    }
    expect(checked).toBeGreaterThan(250)
  })
})

describe('applyFormatFields', () => {
  it('sets new fields, removes stale ones and keeps the rest', () => {
    const pack: Record<string, unknown> = {
      description: 'keep',
      pack_format: 34,
      supported_formats: [34, 64],
      custom: 1
    }
    applyFormatFields(pack, { min_format: 69, max_format: 97 })
    expect(pack).toEqual({ description: 'keep', custom: 1, min_format: 69, max_format: 97 })
  })
})

describe('buildOverlayEntries', () => {
  const spec = (directory: string, min: string, max: string): OverlaySpec => ({
    directory,
    min: format(min),
    max: format(max)
  })

  it('omits formats when every overlay is modern-only', () => {
    expect(buildOverlayEntries([spec('new', '1.21.9', '26.3')])).toEqual([
      { directory: 'new', min_format: 69, max_format: 97 }
    ])
  })

  it('adds formats to every entry when one overlay reaches below 65', () => {
    expect(
      buildOverlayEntries([spec('old', '1.21', '1.21.8'), spec('new', '26.3', '26.3')])
    ).toEqual([
      { directory: 'old', min_format: 34, max_format: 64, formats: [34, 64] },
      { directory: 'new', min_format: [97, 1], max_format: 97, formats: [97, 97] }
    ])
  })

  it('produces overlays the analyzer accepts, active on the chosen releases', () => {
    const specs = [spec('legacy_fix', '1.20.2', '1.21.4'), spec('modern', '1.21.9', '26.3')]
    const analysis = analyzeWith(
      { ...formatFieldsForRange(format('1.20'), format('26.3')) },
      { overlays: { entries: buildOverlayEntries(specs) } }
    )
    expect(analysis.issues).toEqual([])
    const [legacyFix, modern] = analysis.overlays
    expect(
      GAME_RELEASES.filter((r) => isOverlayActive(legacyFix!, r)).map((r) => r.version)
    ).toEqual(expectedBetween(release('1.20.2'), release('1.21.4')))
    expect(GAME_RELEASES.filter((r) => isOverlayActive(modern!, r)).map((r) => r.version)).toEqual(
      expectedBetween(release('1.21.9'), release('26.3'))
    )
  })
})

describe('overlay analysis', () => {
  const errorsFor = (entries: unknown) =>
    analyzeWith({ min_format: 69, max_format: 97 }, { overlays: { entries } }).issues.filter(
      (i) => i.severity === 'error'
    )

  it('requires a directory and min/max_format', () => {
    expect(errorsFor([{ min_format: 69, max_format: 97 }])).toHaveLength(1)
    expect(errorsFor([{ directory: 'a' }])).toHaveLength(1)
    expect(errorsFor([{ directory: 'a', min_format: 69 }])).toHaveLength(1)
  })

  it('enforces the formats rule across all entries', () => {
    // One legacy overlay without formats on the modern one → error on it.
    expect(
      errorsFor([
        { directory: 'old', min_format: 34, max_format: 64, formats: [34, 64] },
        { directory: 'new', min_format: 69, max_format: 97 }
      ])
    ).toHaveLength(1)
    // formats on modern-only overlays → error.
    expect(
      errorsFor([{ directory: 'new', min_format: 69, max_format: 97, formats: [69, 97] }])
    ).toHaveLength(1)
  })

  it('rejects a malformed overlays section', () => {
    expect(errorsFor('nope')).toHaveLength(1)
    const analysis = analyzeWith({ min_format: 69, max_format: 97 }, { overlays: [] })
    expect(analysis.issues.filter((i) => i.severity === 'error')).toHaveLength(1)
  })

  it('pre-1.20.2 releases never apply overlays', () => {
    const [overlay] = analyzeWith(
      { pack_format: 15, supported_formats: [15, 22] },
      {
        overlays: {
          entries: [{ directory: 'a', min_format: 15, max_format: 22, formats: [15, 22] }]
        }
      }
    ).overlays
    expect(isOverlayActive(overlay!, release('1.20.1'))).toBe(false)
    expect(isOverlayActive(overlay!, release('1.20.2'))).toBe(true)
  })
})

describe('validateOverlayDirectory', () => {
  it.each(['overlay_1', 'v1.21-fix', 'a'])('accepts %j', (name) => {
    expect(validateOverlayDirectory(name)).toBeNull()
  })

  it.each(['', 'Overlay', 'a b', 'a/b', '..', 'assets', 'data', 'è'])('rejects %j', (name) => {
    expect(validateOverlayDirectory(name)).not.toBeNull()
  })
})

describe('parseVersionRangeRequest', () => {
  const valid = {
    minVersion: '1.21',
    maxVersion: '26.3',
    overlays: [{ directory: 'modern', minVersion: '1.21.9', maxVersion: '26.3' }]
  }

  it('resolves versions', () => {
    const result = parseVersionRangeRequest(valid)
    expect(result.ok && result.value.min.version).toBe('1.21')
    expect(result.ok && result.value.overlays[0]?.min).toEqual({ major: 69, minor: 0 })
  })

  it.each([
    null,
    { ...valid, minVersion: '1.8.9' },
    { ...valid, minVersion: '26.3', maxVersion: '1.21' },
    { ...valid, overlays: 'x' },
    { ...valid, overlays: [{ directory: '../x', minVersion: '1.21', maxVersion: '1.21' }] },
    { ...valid, overlays: [valid.overlays[0], valid.overlays[0]] },
    { ...valid, overlays: [{ directory: 'a', minVersion: '26.3', maxVersion: '1.21' }] }
  ])('rejects %j', (input) => {
    expect(parseVersionRangeRequest(input).ok).toBe(false)
  })
})
