import { describe, expect, it } from 'vitest'
import {
  analyzePackMcmeta,
  buildPackMcmeta,
  compatibleFormatRange,
  compatibleReleases,
  isCompatibleWith,
  serializeMcmeta,
  textComponentToPlain
} from './mcmeta'
import { ANY_MINOR, GAME_RELEASES } from './packFormat'

describe('buildPackMcmeta', () => {
  it('uses only pack_format for formats below 65', () => {
    expect(buildPackMcmeta('Old', { major: 64, minor: 0 })).toEqual({
      pack: { description: 'Old', pack_format: 64 }
    })
  })

  it('uses min_format/max_format from format 65 on', () => {
    expect(buildPackMcmeta('New', { major: 69, minor: 0 })).toEqual({
      pack: { description: 'New', min_format: 69, max_format: 69 }
    })
  })

  it('writes the minor version in min_format when non-zero', () => {
    expect(buildPackMcmeta('Minor', { major: 97, minor: 1 })).toEqual({
      pack: { description: 'Minor', min_format: [97, 1], max_format: 97 }
    })
  })

  it('never mixes legacy and modern fields', () => {
    const modern = buildPackMcmeta('x', { major: 75, minor: 0 }).pack
    expect(modern).not.toHaveProperty('pack_format')
    const legacy = buildPackMcmeta('x', { major: 15, minor: 0 }).pack
    expect(legacy).not.toHaveProperty('min_format')
    expect(legacy).not.toHaveProperty('max_format')
  })
})

describe('serializeMcmeta', () => {
  it('produces pretty JSON with a trailing newline that round-trips', () => {
    const mcmeta = buildPackMcmeta('Città "speciale"', { major: 97, minor: 1 })
    const text = serializeMcmeta(mcmeta)
    expect(text.endsWith('}\n')).toBe(true)
    expect(JSON.parse(text)).toEqual(mcmeta)
  })
})

describe('analyzePackMcmeta', () => {
  const analyze = (pack: unknown) => analyzePackMcmeta(JSON.stringify({ pack }))
  const errors = (pack: unknown) =>
    analyze(pack).issues.filter((issue) => issue.severity === 'error')

  it('accepts what buildPackMcmeta writes, for every supported release', () => {
    for (const release of GAME_RELEASES) {
      const text = serializeMcmeta(buildPackMcmeta('Desc', release.resourceFormat))
      const analysis = analyzePackMcmeta(text)
      expect(analysis.issues).toEqual([])
      expect(analysis.description).toBe('Desc')
      expect(isCompatibleWith(analysis.formats, release)).toBe(true)
    }
  })

  it('reports invalid JSON and a missing pack section as errors', () => {
    expect(analyzePackMcmeta('{ nope').issues[0]?.severity).toBe('error')
    expect(analyzePackMcmeta('[]').issues[0]?.severity).toBe('error')
    expect(analyzePackMcmeta('{"pack": 5}').issues[0]?.severity).toBe('error')
  })

  it('ignores a UTF-8 BOM', () => {
    const analysis = analyzePackMcmeta('\uFEFF{"pack":{"description":"x","pack_format":15}}')
    expect(analysis.issues).toEqual([])
  })

  it('requires some format declaration', () => {
    expect(errors({ description: 'x' })).toHaveLength(1)
  })

  it('requires min_format and max_format together, and in order', () => {
    expect(errors({ description: 'x', min_format: 69 })).not.toHaveLength(0)
    expect(errors({ description: 'x', max_format: 69 })).not.toHaveLength(0)
    expect(errors({ description: 'x', min_format: 75, max_format: 69 })).not.toHaveLength(0)
    expect(errors({ description: 'x', min_format: [97, 2], max_format: [97, 1] })).not.toHaveLength(
      0
    )
  })

  it('parses format values in all allowed forms', () => {
    expect(
      analyze({ description: 'x', min_format: [69], max_format: [97, 1] }).formats.range
    ).toEqual({
      min: { major: 69, minor: 0 },
      max: { major: 97, minor: 1 }
    })
    expect(
      analyze({ description: 'x', min_format: 69, max_format: 97 }).formats.range?.max
    ).toEqual({
      major: 97,
      minor: ANY_MINOR
    })
    expect(errors({ description: 'x', min_format: '69', max_format: 97 })).not.toHaveLength(0)
    expect(errors({ description: 'x', min_format: [69, 0, 1], max_format: 97 })).not.toHaveLength(0)
    expect(errors({ description: 'x', pack_format: 1.5 })).not.toHaveLength(0)
  })

  it('requires min/max_format from format 65 on', () => {
    expect(errors({ description: 'x', pack_format: 69 })).not.toHaveLength(0)
  })

  it('applies the 25w31a legacy-field rules', () => {
    // Range reaching below 65 needs pack_format (error) and supported_formats (warning).
    const legacy = analyze({ description: 'x', min_format: 34, max_format: 97 }).issues
    expect(legacy.filter((i) => i.severity === 'error')).toHaveLength(1)
    expect(legacy.filter((i) => i.severity === 'warning')).toHaveLength(1)
    // supported_formats is forbidden for modern-only packs.
    expect(
      errors({ description: 'x', min_format: 69, max_format: 97, supported_formats: [69, 97] })
    ).toHaveLength(1)
    // A complete multi-version pack is clean.
    expect(
      analyze({
        description: 'x',
        pack_format: 34,
        supported_formats: [34, 64],
        min_format: 34,
        max_format: 97
      }).issues
    ).toEqual([])
  })

  it('accepts every supported_formats form and validates it', () => {
    const range = (supported_formats: unknown) =>
      analyze({ description: 'x', pack_format: 22, supported_formats }).formats.supportedFormats
    expect(range(22)).toEqual({ min: 22, max: 22 })
    expect(range([18, 32])).toEqual({ min: 18, max: 32 })
    expect(range({ min_inclusive: 18, max_inclusive: 34 })).toEqual({ min: 18, max: 34 })
    expect(errors({ description: 'x', pack_format: 22, supported_formats: [32, 18] })).toHaveLength(
      1
    )
    expect(errors({ description: 'x', pack_format: 22, supported_formats: 'all' })).toHaveLength(1)
  })

  it('warns about a missing description and pack_format outside supported_formats', () => {
    const issues = analyze({ pack_format: 15, supported_formats: [18, 22] }).issues
    expect(issues.map((i) => i.severity)).toEqual(['warning', 'warning'])
  })

  it('warns when no supported release is compatible', () => {
    const issues = analyze({ description: 'x', pack_format: 9 }).issues
    expect(issues).toHaveLength(1)
    expect(issues[0]?.severity).toBe('warning')
  })
})

describe('compatibility', () => {
  const versionsOf = (pack: unknown) =>
    compatibleReleases(analyzePackMcmeta(JSON.stringify({ pack })).formats).map((r) => r.version)

  it('uses only pack_format before 1.20.2', () => {
    expect(versionsOf({ pack_format: 15, supported_formats: [15, 22] })).toEqual(
      expect.arrayContaining(['1.20', '1.20.1', '1.20.2', '1.20.3', '1.20.4'])
    )
    expect(versionsOf({ pack_format: 22, supported_formats: [15, 22] })).not.toContain('1.20')
  })

  it('uses supported_formats from 1.20.2 and min/max_format from 1.21.9', () => {
    const versions = versionsOf({
      pack_format: 34,
      supported_formats: [34, 64],
      min_format: 34,
      max_format: 69
    })
    expect(versions).toEqual([
      '1.21.10',
      '1.21.9',
      '1.21.8',
      '1.21.7',
      '1.21.6',
      '1.21.5',
      '1.21.4',
      '1.21.3',
      '1.21.2',
      '1.21.1',
      '1.21'
    ])
  })

  it('respects minor versions in min_format', () => {
    expect(versionsOf({ min_format: [97, 1], max_format: 97 })).toEqual(['26.3'])
    expect(versionsOf({ min_format: [97, 2], max_format: 97 })).toEqual([])
  })

  it('treats legacy-only packs as incompatible with 1.21.9+', () => {
    expect(versionsOf({ pack_format: 64, supported_formats: [34, 99] })).not.toContain('1.21.9')
  })
})

describe('textComponentToPlain', () => {
  it('flattens strings, objects, arrays and extras', () => {
    expect(textComponentToPlain('§aCiao')).toBe('§aCiao')
    expect(textComponentToPlain({ text: 'A', extra: ['B', { text: 'C', color: 'red' }] })).toBe(
      'ABC'
    )
    expect(textComponentToPlain(['X', { text: 'Y' }, 3])).toBe('XY3')
    expect(textComponentToPlain({ translate: 'pack.desc', fallback: 'Fallback' })).toBe('Fallback')
    expect(textComponentToPlain({ translate: 'pack.desc' })).toBe('pack.desc')
    expect(textComponentToPlain(null)).toBe('')
  })
})

describe('descriptionKind', () => {
  it('tells strings, components and missing descriptions apart', () => {
    const kind = (pack: unknown) => analyzePackMcmeta(JSON.stringify({ pack })).descriptionKind
    expect(kind({ description: 'x', pack_format: 15 })).toBe('string')
    expect(kind({ description: { text: 'x' }, pack_format: 15 })).toBe('component')
    expect(kind({ description: ['x'], pack_format: 15 })).toBe('component')
    expect(kind({ pack_format: 15 })).toBe('missing')
    expect(analyzePackMcmeta('nope').descriptionKind).toBe('missing')
  })
})

describe('compatibleFormatRange', () => {
  it('spans the formats of the releases that load the pack', () => {
    const range = compatibleFormatRange(
      analyzePackMcmeta(JSON.stringify({ pack: { pack_format: 46, description: '' } })).formats
    )
    expect(range).toEqual({ min: { major: 46, minor: 0 }, max: { major: 46, minor: 0 } })
    expect(
      compatibleFormatRange(
        analyzePackMcmeta(JSON.stringify({ pack: { pack_format: 3, description: '' } })).formats
      )
    ).toBeNull()
  })
})
