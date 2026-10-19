import { describe, expect, it } from 'vitest'
import { isNewer, isReleaseUrl, parseRelease, RELEASES_PAGE } from './updates'

describe('parseRelease', () => {
  it('reads tag and page of a published release', () => {
    expect(parseRelease({ tag_name: 'v1.2.0', html_url: `${RELEASES_PAGE}/tag/v1.2.0` })).toEqual({
      version: '1.2.0',
      url: `${RELEASES_PAGE}/tag/v1.2.0`
    })
  })

  it('ignores drafts, pre-releases, odd tags and foreign links', () => {
    const page = `${RELEASES_PAGE}/tag/v2.0.0`
    expect(parseRelease({ tag_name: 'v2.0.0', html_url: page, prerelease: true })).toBeNull()
    expect(parseRelease({ tag_name: 'v2.0.0', html_url: page, draft: true })).toBeNull()
    expect(parseRelease({ tag_name: 'nightly', html_url: page })).toBeNull()
    expect(parseRelease({ tag_name: 'v2.0.0', html_url: 'https://evil.example/x' })).toBeNull()
    expect(isReleaseUrl('https://github.com/Andrix03/packforge-evil/releases')).toBe(false)
  })
})

describe('isNewer', () => {
  it('compares numerically', () => {
    expect(isNewer('0.10.0', '0.9.0')).toBe(true)
    expect(isNewer('0.1.0', '0.1.0')).toBe(false)
    expect(isNewer('0.0.9', '0.1.0')).toBe(false)
  })
})
