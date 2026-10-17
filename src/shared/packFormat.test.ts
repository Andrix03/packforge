import { describe, expect, it } from 'vitest'
import {
  findRelease,
  formatPackVersion,
  GAME_RELEASES,
  LATEST_RELEASE,
  summarizeReleaseSpans
} from './packFormat'

describe('packFormat', () => {
  it('maps verified releases to their resource pack format', () => {
    expect(findRelease('26.3')?.resourceFormat).toEqual({ major: 97, minor: 1 })
    expect(findRelease('26.1.1')?.resourceFormat).toEqual({ major: 84, minor: 0 })
    expect(findRelease('1.21.9')?.resourceFormat).toEqual({ major: 69, minor: 0 })
    expect(findRelease('1.21.8')?.resourceFormat).toEqual({ major: 64, minor: 0 })
    expect(findRelease('1.21')?.resourceFormat).toEqual({ major: 34, minor: 0 })
    expect(findRelease('1.20')?.resourceFormat).toEqual({ major: 15, minor: 0 })
  })

  it('returns undefined for unknown or unsupported versions', () => {
    expect(findRelease('1.19.4')).toBeUndefined()
    expect(findRelease('26.4')).toBeUndefined()
    expect(findRelease('')).toBeUndefined()
  })

  it('lists unique versions, newest format first', () => {
    const versions = GAME_RELEASES.map((release) => release.version)
    expect(new Set(versions).size).toBe(versions.length)
    expect(LATEST_RELEASE.version).toBe('26.3')

    for (let i = 1; i < GAME_RELEASES.length; i++) {
      const previous = GAME_RELEASES[i - 1]!.resourceFormat
      const current = GAME_RELEASES[i]!.resourceFormat
      expect(current.major * 1000 + current.minor).toBeLessThanOrEqual(
        previous.major * 1000 + previous.minor
      )
    }
  })

  it('formats versions as major.minor', () => {
    expect(formatPackVersion({ major: 97, minor: 1 })).toBe('97.1')
  })
})

describe('summarizeReleaseSpans', () => {
  const pick = (...versions: string[]) =>
    versions.map((version) => {
      const release = findRelease(version)
      if (!release) throw new Error(version)
      return release
    })

  it('groups contiguous releases oldest first', () => {
    expect(summarizeReleaseSpans(pick('1.21.1', '1.21', '1.20.6', '1.20.5', '26.3'))).toEqual([
      '1.20.5 – 1.21.1',
      '26.3'
    ])
  })

  it('handles single, all and none', () => {
    expect(summarizeReleaseSpans(pick('1.21.4'))).toEqual(['1.21.4'])
    expect(summarizeReleaseSpans(GAME_RELEASES)).toEqual(['1.20 – 26.3'])
    expect(summarizeReleaseSpans([])).toEqual([])
  })
})
