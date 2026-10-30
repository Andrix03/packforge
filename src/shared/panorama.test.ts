import { describe, expect, it } from 'vitest'
import { PANORAMA_FACES, panoramaMissing, panoramaSizes } from './panorama'

describe('panoramaMissing', () => {
  it('is fine with no face or with all six', () => {
    expect(panoramaMissing(['pack.mcmeta'])).toBeNull()
    expect(panoramaMissing(PANORAMA_FACES)).toBeNull()
  })

  it('names the missing faces when only some are in the pack', () => {
    const message = panoramaMissing([PANORAMA_FACES[0]!])
    expect(message).toContain('1 facce su 6')
    expect(message).toContain('panorama_1, panorama_2, panorama_3, panorama_4, panorama_5')
  })
})

describe('panoramaSizes', () => {
  it('accepts six faces of one size', () => {
    expect(panoramaSizes(Array(6).fill([256, 256]))).toBeNull()
  })

  it('rejects mixed sizes, as the game does', () => {
    const message = panoramaSizes([
      [1024, 1024],
      [1024, 1024],
      [1024, 1024],
      [1024, 1024],
      [16, 16],
      [1024, 1024]
    ])
    expect(message).toContain('4: 16×16')
  })
})
