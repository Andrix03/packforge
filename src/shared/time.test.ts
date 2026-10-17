import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './time'

const NOW = new Date('2026-10-18T12:00:00Z')

describe('formatRelativeTime', () => {
  it.each([
    ['2026-10-18T11:59:40Z', 'adesso'],
    ['2026-10-18T11:55:00Z', '5 minuti fa'],
    ['2026-10-18T10:00:00Z', '2 ore fa'],
    ['2026-10-17T12:00:00Z', 'ieri'],
    ['2026-10-04T12:00:00Z', '2 settimane fa'],
    ['2025-10-18T12:00:00Z', 'anno scorso']
  ])('%s → %s', (iso, expected) => {
    expect(formatRelativeTime(iso, NOW)).toBe(expected)
  })

  it('returns an empty string for invalid dates', () => {
    expect(formatRelativeTime('nope', NOW)).toBe('')
  })
})
