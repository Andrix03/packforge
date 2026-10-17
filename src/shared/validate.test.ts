import { describe, expect, it } from 'vitest'
import {
  PACK_DESCRIPTION_MAX_LENGTH,
  PACK_NAME_MAX_LENGTH,
  parseCreatePackRequest,
  validatePackDescription,
  validatePackName
} from './validate'

describe('validatePackName', () => {
  it('accepts ordinary names', () => {
    expect(validatePackName('Il mio pack')).toBeNull()
    expect(validatePackName('pack-v1.2_HD')).toBeNull()
    expect(validatePackName('  spazi attorno  ')).toBeNull()
  })

  it('rejects empty and too long names', () => {
    expect(validatePackName('')).not.toBeNull()
    expect(validatePackName('   ')).not.toBeNull()
    expect(validatePackName('a'.repeat(PACK_NAME_MAX_LENGTH))).toBeNull()
    expect(validatePackName('a'.repeat(PACK_NAME_MAX_LENGTH + 1))).not.toBeNull()
  })

  it.each(['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'a\u0007b'])(
    'rejects invalid characters in %j',
    (name) => expect(validatePackName(name)).not.toBeNull()
  )

  it.each(['..', '.', 'fine.', 'CON', 'nul', 'Com1', 'lpt9', 'aux.txt'])(
    'rejects reserved or dot-terminated name %j',
    (name) => expect(validatePackName(name)).not.toBeNull()
  )

  it('allows names that merely contain reserved words', () => {
    expect(validatePackName('console')).toBeNull()
    expect(validatePackName('com10')).toBeNull()
  })
})

describe('validatePackDescription', () => {
  it('allows empty and limits length', () => {
    expect(validatePackDescription('')).toBeNull()
    expect(validatePackDescription('x'.repeat(PACK_DESCRIPTION_MAX_LENGTH + 1))).not.toBeNull()
  })
})

describe('parseCreatePackRequest', () => {
  const valid = { parentDir: 'C:\\packs', name: ' Pack ', description: 'Desc', gameVersion: '26.3' }

  it('accepts a valid request and trims the name', () => {
    expect(parseCreatePackRequest(valid)).toEqual({ ok: true, value: { ...valid, name: 'Pack' } })
  })

  it.each([null, undefined, 'string', 42, [], {}])('rejects malformed input %j', (input) => {
    expect(parseCreatePackRequest(input).ok).toBe(false)
  })

  it('rejects wrong field types', () => {
    expect(parseCreatePackRequest({ ...valid, name: 5 }).ok).toBe(false)
    expect(parseCreatePackRequest({ ...valid, parentDir: undefined }).ok).toBe(false)
  })

  it('rejects empty destination, invalid name and unknown versions', () => {
    expect(parseCreatePackRequest({ ...valid, parentDir: '  ' }).ok).toBe(false)
    expect(parseCreatePackRequest({ ...valid, name: '../evil' }).ok).toBe(false)
    expect(parseCreatePackRequest({ ...valid, gameVersion: '1.8.9' }).ok).toBe(false)
  })
})
