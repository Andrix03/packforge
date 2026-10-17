// Square crop used for pack.png. The crop is a square of side
// `min(width, height) / zoom` centered on (centerX, centerY) in image pixels,
// always kept inside the image.

export interface SquareCrop {
  /** >= 1; 1 shows the largest square that fits. */
  zoom: number
  centerX: number
  centerY: number
}

export interface CropRect {
  sx: number
  sy: number
  size: number
}

export const MAX_ZOOM = 16

/** Centered crop of the largest square. */
export function initialCrop(width: number, height: number): SquareCrop {
  return { zoom: 1, centerX: width / 2, centerY: height / 2 }
}

/** Source rectangle for a crop, clamped inside the image. */
export function cropRect(width: number, height: number, crop: SquareCrop): CropRect {
  const zoom = clamp(crop.zoom, 1, MAX_ZOOM)
  const size = Math.min(width, height) / zoom
  const sx = clamp(crop.centerX - size / 2, 0, width - size)
  const sy = clamp(crop.centerY - size / 2, 0, height - size)
  return { sx, sy, size }
}

/** Re-centers a crop so it stays inside the image after zoom/pan. */
export function clampCrop(width: number, height: number, crop: SquareCrop): SquareCrop {
  const zoom = clamp(crop.zoom, 1, MAX_ZOOM)
  const { sx, sy, size } = cropRect(width, height, { ...crop, zoom })
  return { zoom, centerX: sx + size / 2, centerY: sy + size / 2 }
}

/**
 * Pans by a drag of (dx, dy) screen pixels in a viewport `viewportSize` wide.
 * Dragging right moves the image right, i.e. the crop window left.
 */
export function panCrop(
  width: number,
  height: number,
  crop: SquareCrop,
  dx: number,
  dy: number,
  viewportSize: number
): SquareCrop {
  const { size } = cropRect(width, height, crop)
  const scale = size / viewportSize
  return clampCrop(width, height, {
    ...crop,
    centerX: crop.centerX - dx * scale,
    centerY: crop.centerY - dy * scale
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
