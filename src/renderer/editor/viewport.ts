// Pure zoom/pan math for the pixel canvas. All values are in device pixels so that every
// texture pixel covers a whole number of screen pixels (crisp, no smoothing).

export interface Viewport {
  /** Screen pixels per texture pixel (always one of ZOOM_LEVELS). */
  zoom: number
  /** Screen position of the texture's top-left corner. */
  x: number
  y: number
}

export interface Frame {
  imageWidth: number
  imageHeight: number
  viewWidth: number
  viewHeight: number
}

export const ZOOM_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128] as const

/** Below this zoom the per-pixel grid would hide the texture, so it is not drawn. */
export const GRID_MIN_ZOOM = 6

/** Part of the texture (in screen pixels) that must stay visible while panning. */
const MIN_VISIBLE = 48

/** Largest zoom level that fits the texture in `margin` of the view, centered. */
export function fitViewport(frame: Frame, margin = 0.85): Viewport {
  const limit = Math.min(
    (frame.viewWidth * margin) / frame.imageWidth,
    (frame.viewHeight * margin) / frame.imageHeight
  )
  const zoom = [...ZOOM_LEVELS].reverse().find((level) => level <= limit) ?? ZOOM_LEVELS[0]
  return {
    zoom,
    x: Math.round((frame.viewWidth - frame.imageWidth * zoom) / 2),
    y: Math.round((frame.viewHeight - frame.imageHeight * zoom) / 2)
  }
}

/** The next zoom level in `direction` (+1 in, -1 out), clamped to the ends of the list. */
export function nextZoomLevel(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_LEVELS.find((level) => level > zoom) ?? ZOOM_LEVELS.at(-1)!
  return [...ZOOM_LEVELS].reverse().find((level) => level < zoom) ?? ZOOM_LEVELS[0]
}

/** Zooms one step keeping the texture point under (anchorX, anchorY) fixed on screen. */
export function zoomAt(
  viewport: Viewport,
  direction: 1 | -1,
  anchorX: number,
  anchorY: number,
  frame: Frame
): Viewport {
  const zoom = nextZoomLevel(viewport.zoom, direction)
  if (zoom === viewport.zoom) return viewport
  const imageX = (anchorX - viewport.x) / viewport.zoom
  const imageY = (anchorY - viewport.y) / viewport.zoom
  return clampViewport(
    { zoom, x: Math.round(anchorX - imageX * zoom), y: Math.round(anchorY - imageY * zoom) },
    frame
  )
}

export function panBy(viewport: Viewport, dx: number, dy: number, frame: Frame): Viewport {
  return clampViewport(
    { zoom: viewport.zoom, x: Math.round(viewport.x + dx), y: Math.round(viewport.y + dy) },
    frame
  )
}

/** Keeps at least a corner of the texture on screen so it can't be lost off the edges. */
export function clampViewport(viewport: Viewport, frame: Frame): Viewport {
  const width = frame.imageWidth * viewport.zoom
  const height = frame.imageHeight * viewport.zoom
  const keepX = Math.min(MIN_VISIBLE, width)
  const keepY = Math.min(MIN_VISIBLE, height)
  return {
    zoom: viewport.zoom,
    x: clamp(viewport.x, keepX - width, frame.viewWidth - keepX),
    y: clamp(viewport.y, keepY - height, frame.viewHeight - keepY)
  }
}

/** Texture pixel under a screen point, or null outside the texture. */
export function screenToPixel(
  viewport: Viewport,
  screenX: number,
  screenY: number,
  frame: Pick<Frame, 'imageWidth' | 'imageHeight'>
): { x: number; y: number } | null {
  const x = Math.floor((screenX - viewport.x) / viewport.zoom)
  const y = Math.floor((screenY - viewport.y) / viewport.zoom)
  if (x < 0 || y < 0 || x >= frame.imageWidth || y >= frame.imageHeight) return null
  return { x, y }
}

/**
 * Spacing of the stronger grid lines: one cell per 16×-texture pixel (2 px at 32×, 4 px at 64×),
 * so high-resolution textures show the vanilla pixel scale. Null at 16× and below, or when the
 * width is not a multiple of 16.
 */
export function majorGridStep(imageWidth: number): number | null {
  if (imageWidth <= 16 || imageWidth % 16 !== 0) return null
  return imageWidth / 16
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
