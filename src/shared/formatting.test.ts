import { describe, expect, it } from 'vitest'
import {
  COLOR_CODES,
  insertCode,
  parseFormattedText,
  SECTION_SIGN as S,
  stripFormatting
} from './formatting'

const plain = {
  color: null,
  bold: false,
  italic: false,
  underlined: false,
  strikethrough: false,
  obfuscated: false
}

describe('COLOR_CODES', () => {
  it('has the 16 Java colors with unique codes', () => {
    expect(COLOR_CODES).toHaveLength(16)
    expect(new Set(COLOR_CODES.map((c) => c.code)).size).toBe(16)
    expect(COLOR_CODES.find((c) => c.code === '6')?.hex).toBe('#FFAA00')
  })
})

describe('parseFormattedText', () => {
  it('returns plain text as one segment', () => {
    expect(parseFormattedText('Ciao')).toEqual([{ text: 'Ciao', style: plain }])
    expect(parseFormattedText('')).toEqual([])
  })

  it('applies colors and formats', () => {
    expect(parseFormattedText(`${S}aVerde ${S}lgrassetto`)).toEqual([
      { text: 'Verde ', style: { ...plain, color: '#55FF55' } },
      { text: 'grassetto', style: { ...plain, color: '#55FF55', bold: true } }
    ])
  })

  it('resets formatting when a color follows a format (Java behavior)', () => {
    const [segment] = parseFormattedText(`${S}l${S}aTesto`)
    expect(segment?.style).toEqual({ ...plain, color: '#55FF55' })
  })

  it('resets everything with §r', () => {
    expect(parseFormattedText(`${S}c${S}oA${S}rB`)).toEqual([
      { text: 'A', style: { ...plain, color: '#FF5555', italic: true } },
      { text: 'B', style: plain }
    ])
  })

  it('accepts upper-case codes and consumes unknown ones', () => {
    expect(parseFormattedText(`${S}AX`)[0]?.style.color).toBe('#55FF55')
    expect(parseFormattedText(`a${S}zb`)).toEqual([{ text: 'ab', style: plain }])
  })

  it('ignores a trailing section sign', () => {
    expect(parseFormattedText(`fine${S}`)).toEqual([{ text: 'fine', style: plain }])
  })

  it('merges adjacent segments with the same style', () => {
    expect(parseFormattedText(`${S}aA${S}aB`)).toEqual([
      { text: 'AB', style: { ...plain, color: '#55FF55' } }
    ])
  })
})

describe('stripFormatting', () => {
  it('removes all codes', () => {
    expect(stripFormatting(`${S}6${S}lPack ${S}rPBR`)).toBe('Pack PBR')
  })
})

describe('insertCode', () => {
  it('inserts at the caret', () => {
    expect(insertCode('Pack', 0, 0, 'a')).toEqual({ text: `${S}aPack`, caret: 2 })
    expect(insertCode('Pack', 4, 4, 'l')).toEqual({ text: `Pack${S}l`, caret: 6 })
  })

  it('wraps a selection and closes it with §r', () => {
    expect(insertCode('Il mio pack', 3, 6, 'c')).toEqual({
      text: `Il ${S}cmio${S}r pack`,
      caret: 10
    })
  })

  it('handles reversed or out-of-range selections', () => {
    expect(insertCode('ab', 2, 0, 'a').text).toBe(`${S}aab${S}r`)
    expect(insertCode('ab', 10, 10, 'a').text).toBe(`ab${S}a`)
  })
})
