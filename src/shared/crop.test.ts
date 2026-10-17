import { describe, expect, it } from 'vitest'
import { clampCrop, cropRect, initialCrop, MAX_ZOOM, panCrop } from './crop'

describe('cropRect', () => {
  it('starts with the largest centered square', () => {
    expect(cropRect(200, 100, initialCrop(200, 100))).toEqual({ sx: 50, sy: 0, size: 100 })
    expect(cropRect(64, 64, initialCrop(64, 64))).toEqual({ sx: 0, sy: 0, size: 64 })
  })

  it('shrinks the square with zoom', () => {
    expect(cropRect(100, 100, { zoom: 4, centerX: 50, centerY: 50 })).toEqual({
      sx: 37.5,
      sy: 37.5,
      size: 25
    })
  })

  it('keeps the square inside the image and clamps zoom', () => {
    expect(cropRect(100, 100, { zoom: 2, centerX: 0, centerY: 1000 })).toEqual({
      sx: 0,
      sy: 50,
      size: 50
    })
    expect(cropRect(100, 100, { zoom: 0.1, centerX: 50, centerY: 50 }).size).toBe(100)
    expect(cropRect(160, 160, { zoom: 999, centerX: 80, centerY: 80 }).size).toBe(160 / MAX_ZOOM)
  })
})

describe('clampCrop', () => {
  it('moves the center back inside', () => {
    expect(clampCrop(100, 100, { zoom: 2, centerX: -50, centerY: 50 })).toEqual({
      zoom: 2,
      centerX: 25,
      centerY: 50
    })
  })
})

describe('panCrop', () => {
  it('converts screen drag to image pixels, opposite to the drag', () => {
    // Crop of 50 px shown in a 200 px viewport: 1 screen px = 0.25 image px.
    const crop = { zoom: 2, centerX: 50, centerY: 50 }
    expect(panCrop(100, 100, crop, 40, -20, 200)).toEqual({ zoom: 2, centerX: 40, centerY: 55 })
  })

  it('cannot pan when the whole image is shown', () => {
    const crop = initialCrop(100, 100)
    expect(panCrop(100, 100, crop, 500, 500, 200)).toEqual(crop)
  })
})
