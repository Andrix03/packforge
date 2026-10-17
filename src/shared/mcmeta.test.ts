import { describe, expect, it } from 'vitest'
import { buildPackMcmeta, serializeMcmeta } from './mcmeta'

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
