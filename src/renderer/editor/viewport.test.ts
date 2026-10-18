import { describe, expect, it } from 'vitest'
import {
  clampViewport,
  fitViewport,
  majorGridStep,
  nextZoomLevel,
  panBy,
  screenToPixel,
  ZOOM_LEVELS,
  zoomAt,
  type Frame
} from './viewport'

const frame: Frame = { imageWidth: 16, imageHeight: 16, viewWidth: 800, viewHeight: 600 }

describe('fitViewport', () => {
  it('picks the largest zoom level that fits and centers the texture', () => {
    // 600 * 0.85 / 16 = 31.9 → 24
    expect(fitViewport(frame)).toEqual({ zoom: 24, x: 208, y: 108 })
  })

  it('never goes below the smallest level for huge textures', () => {
    const big = { ...frame, imageWidth: 4096, imageHeight: 4096 }
    expect(fitViewport(big).zoom).toBe(1)
  })

  it('uses the tighter side for non-square textures (animation strips)', () => {
    // Height limits: 600 * 0.85 / 64 = 7.97 → 6 (width alone would allow 42).
    const strip = { ...frame, imageWidth: 16, imageHeight: 64 }
    expect(fitViewport(strip)).toEqual({ zoom: 6, x: 352, y: 108 })
  })
})

describe('nextZoomLevel', () => {
  it('steps through the levels and stops at the ends', () => {
    expect(nextZoomLevel(8, 1)).toBe(12)
    expect(nextZoomLevel(8, -1)).toBe(6)
    expect(nextZoomLevel(1, -1)).toBe(1)
    expect(nextZoomLevel(ZOOM_LEVELS.at(-1)!, 1)).toBe(ZOOM_LEVELS.at(-1))
  })

  it('snaps an off-list zoom to the neighbouring level', () => {
    expect(nextZoomLevel(5, 1)).toBe(6)
    expect(nextZoomLevel(5, -1)).toBe(4)
  })
})

describe('zoomAt', () => {
  it('keeps the texture pixel under the cursor in place', () => {
    const start = { zoom: 8, x: 100, y: 100 }
    // Cursor over the middle of pixel (5, 3).
    const cursorX = 100 + 5.5 * 8
    const cursorY = 100 + 3.5 * 8
    const zoomed = zoomAt(start, 1, cursorX, cursorY, frame)
    expect(zoomed.zoom).toBe(12)
    expect(screenToPixel(zoomed, cursorX, cursorY, frame)).toEqual({ x: 5, y: 3 })
    const back = zoomAt(zoomed, -1, cursorX, cursorY, frame)
    expect(screenToPixel(back, cursorX, cursorY, frame)).toEqual({ x: 5, y: 3 })
  })

  it('returns the same viewport at the zoom limits', () => {
    const max = { zoom: ZOOM_LEVELS.at(-1)!, x: 0, y: 0 }
    expect(zoomAt(max, 1, 10, 10, frame)).toBe(max)
  })

  it('produces whole-pixel offsets', () => {
    const zoomed = zoomAt({ zoom: 3, x: 7, y: 11 }, 1, 333, 222, frame)
    expect(Number.isInteger(zoomed.x)).toBe(true)
    expect(Number.isInteger(zoomed.y)).toBe(true)
  })
})

describe('panBy / clampViewport', () => {
  it('moves the texture by the drag delta', () => {
    expect(panBy({ zoom: 8, x: 100, y: 100 }, 30, -20, frame)).toEqual({ zoom: 8, x: 130, y: 80 })
  })

  it('keeps part of the texture visible on every side', () => {
    const size = 16 * 8
    expect(panBy({ zoom: 8, x: 100, y: 100 }, 5000, 5000, frame)).toEqual({
      zoom: 8,
      x: 800 - 48,
      y: 600 - 48
    })
    expect(panBy({ zoom: 8, x: 100, y: 100 }, -5000, -5000, frame)).toEqual({
      zoom: 8,
      x: 48 - size,
      y: 48 - size
    })
  })

  it('keeps a tiny texture fully on screen', () => {
    expect(clampViewport({ zoom: 1, x: -100, y: 9999 }, frame)).toEqual({ zoom: 1, x: 0, y: 584 })
  })
})

describe('screenToPixel', () => {
  const viewport = { zoom: 10, x: 50, y: 20 }

  it('maps screen points to texture pixels', () => {
    expect(screenToPixel(viewport, 50, 20, frame)).toEqual({ x: 0, y: 0 })
    expect(screenToPixel(viewport, 59.9, 29.9, frame)).toEqual({ x: 0, y: 0 })
    expect(screenToPixel(viewport, 60, 30, frame)).toEqual({ x: 1, y: 1 })
    expect(screenToPixel(viewport, 50 + 159, 20 + 159, frame)).toEqual({ x: 15, y: 15 })
  })

  it('returns null outside the texture', () => {
    expect(screenToPixel(viewport, 49, 25, frame)).toBeNull()
    expect(screenToPixel(viewport, 50 + 160, 25, frame)).toBeNull()
    expect(screenToPixel(viewport, 55, 20 + 160, frame)).toBeNull()
  })
})

describe('majorGridStep', () => {
  it('marks the 16× pixel scale on high-resolution textures', () => {
    expect(majorGridStep(16)).toBeNull()
    expect(majorGridStep(8)).toBeNull()
    expect(majorGridStep(32)).toBe(2)
    expect(majorGridStep(64)).toBe(4)
    expect(majorGridStep(48)).toBe(3)
    expect(majorGridStep(40)).toBeNull()
  })
})
