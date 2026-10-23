// Drawing of the main editor canvas: checkerboard, the composite, overlays, grid and cursor.

import type { PixelBuffer, Rgba } from './pixels'
import { GRID_MIN_ZOOM, majorGridStep, type Viewport } from './viewport'

/** Size of the transparency checkerboard squares, in CSS pixels. */
const CHECKER_SIZE = 8

export interface CanvasOverlays {
  showGrid: boolean
  /** Pixel under the cursor and the brush size drawn around it. */
  hover: { x: number; y: number; size: number } | null
  /** Vanilla texture drawn over the canvas for tracing. */
  trace: { canvas: HTMLCanvasElement; opacity: number } | null
  /** Symmetry axes to show (mirror drawing). */
  mirror: { x: boolean; y: boolean } | null
  /** Selection outline as unit edges in pixel coordinates. */
  selection: ReadonlyArray<readonly [number, number, number, number]> | null
  /** Seamless mode: draw the 8 neighboring copies around the texture. */
  tiling: boolean
  /** Part of the source shown (texture pixels): the whole image or one animation frame. */
  region: { x: number; y: number; width: number; height: number }
  /** Onion skin: source row where the previous frame starts, drawn faintly on top. */
  onion: { y: number } | null
}

export function drawCanvas(
  canvas: HTMLCanvasElement,
  source: HTMLCanvasElement,
  viewport: Viewport,
  overlays: CanvasOverlays
): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const { zoom, x, y } = viewport
  const { region } = overlays
  const width = region.width * zoom
  const height = region.height * zoom
  const style = getComputedStyle(canvas)
  context.fillStyle = style.getPropertyValue('--bg').trim() || '#1b1d22'
  context.fillRect(0, 0, canvas.width, canvas.height)

  // Checkerboard under the texture so transparent pixels are visible.
  const check = Math.max(1, Math.round(CHECKER_SIZE * (window.devicePixelRatio || 1)))
  const tiles: Array<[number, number]> = overlays.tiling
    ? [-1, 0, 1].flatMap((ty) => [-1, 0, 1].map((tx): [number, number] => [tx, ty]))
    : [[0, 0]]
  context.imageSmoothingEnabled = false
  for (const [tx, ty] of tiles) {
    const ox = x + tx * width
    const oy = y + ty * height
    context.save()
    context.beginPath()
    context.rect(ox, oy, width, height)
    context.clip()
    context.fillStyle = '#8c8c8c'
    context.fillRect(ox, oy, width, height)
    context.fillStyle = '#707070'
    for (let row = 0; row * check < height; row++) {
      for (let col = row % 2; col * check < width; col += 2) {
        context.fillRect(ox + col * check, oy + row * check, check, check)
      }
    }
    context.drawImage(
      source,
      region.x,
      region.y,
      region.width,
      region.height,
      ox,
      oy,
      width,
      height
    )
    // Neighbors are dimmed so the editable copy stays obvious.
    if (tx !== 0 || ty !== 0) {
      context.fillStyle = 'rgba(27, 29, 34, 0.35)'
      context.fillRect(ox, oy, width, height)
    }
    context.restore()
  }
  const { trace, hover, showGrid, mirror, selection, onion } = overlays
  if (onion) {
    context.globalAlpha = 0.3
    context.drawImage(source, region.x, onion.y, region.width, region.height, x, y, width, height)
    context.globalAlpha = 1
  }
  if (trace) {
    // Scaled to the texture size (a 16× reference over a 32× texture still lines up); for an
    // animated reference only its first frame.
    const traceHeight = Math.min(
      trace.canvas.height,
      (trace.canvas.width * region.height) / region.width
    )
    context.globalAlpha = trace.opacity
    context.drawImage(trace.canvas, 0, 0, trace.canvas.width, traceHeight, x, y, width, height)
    context.globalAlpha = 1
  }

  if (showGrid && zoom >= GRID_MIN_ZOOM) {
    strokeGrid(context, viewport, region.width, region.height, 1, 'rgba(0, 0, 0, 0.22)')
  }
  const major = majorGridStep(region.width)
  if (showGrid && major !== null && zoom * major >= GRID_MIN_ZOOM) {
    strokeGrid(context, viewport, region.width, region.height, major, 'rgba(0, 0, 0, 0.5)')
  }
  context.strokeStyle = 'rgba(255, 255, 255, 0.25)'
  context.lineWidth = 1
  context.strokeRect(x - 0.5, y - 0.5, width + 1, height + 1)

  if (mirror?.x || mirror?.y) {
    context.save()
    context.strokeStyle = 'rgba(111, 191, 115, 0.9)'
    context.setLineDash([6, 4])
    context.lineWidth = 2
    context.beginPath()
    if (mirror.x) {
      context.moveTo(x + width / 2, y - 8)
      context.lineTo(x + width / 2, y + height + 8)
    }
    if (mirror.y) {
      context.moveTo(x - 8, y + height / 2)
      context.lineTo(x + width + 8, y + height / 2)
    }
    context.stroke()
    context.restore()
  }

  if (selection && selection.length > 0) {
    // "Marching ants": a dark line under a dashed light one, visible on any color.
    context.save()
    context.beginPath()
    for (const [x1, y1, x2, y2] of selection) {
      context.moveTo(x + x1 * zoom + 0.5, y + y1 * zoom + 0.5)
      context.lineTo(x + x2 * zoom + 0.5, y + y2 * zoom + 0.5)
    }
    context.lineWidth = 1
    context.strokeStyle = 'rgba(0, 0, 0, 0.9)'
    context.stroke()
    context.setLineDash([4, 4])
    context.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    context.stroke()
    context.restore()
  }

  // Outline of the pixels the tool will paint (same footprint as Stroke's brush): dark + light so
  // it shows on any color.
  if (hover) {
    const offset = Math.floor((hover.size - 1) / 2)
    const hx = x + (hover.x - offset) * zoom
    const hy = y + (hover.y - offset) * zoom
    const side = hover.size * zoom
    context.strokeStyle = 'rgba(0, 0, 0, 0.8)'
    context.strokeRect(hx + 0.5, hy + 0.5, side - 1, side - 1)
    if (zoom >= 4) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      context.strokeRect(hx + 1.5, hy + 1.5, side - 3, side - 3)
    }
  }
}

function strokeGrid(
  context: CanvasRenderingContext2D,
  { zoom, x, y }: Viewport,
  columns: number,
  rows: number,
  step: number,
  color: string
): void {
  context.beginPath()
  for (let col = step; col < columns; col += step) {
    context.moveTo(x + col * zoom + 0.5, y)
    context.lineTo(x + col * zoom + 0.5, y + rows * zoom)
  }
  for (let row = step; row < rows; row += step) {
    context.moveTo(x, y + row * zoom + 0.5)
    context.lineTo(x + columns * zoom, y + row * zoom + 0.5)
  }
  context.strokeStyle = color
  context.lineWidth = 1
  context.stroke()
}

/** Copies a buffer into a display canvas (never read back: canvases store premultiplied alpha). */
export function putBuffer(canvas: HTMLCanvasElement, buffer: PixelBuffer): void {
  // Animation frames added/removed: the display canvas follows the image size.
  if (canvas.width !== buffer.width) canvas.width = buffer.width
  if (canvas.height !== buffer.height) canvas.height = buffer.height
  const data = new Uint8ClampedArray(buffer.data)
  canvas.getContext('2d')?.putImageData(new ImageData(data, buffer.width, buffer.height), 0, 0)
}

export function cssColor([r, g, b, a]: Rgba): string {
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`
}

export function formatColor([r, g, b, a]: Rgba): string {
  const hex = [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
  return a === 255 ? `#${hex}` : a === 0 ? 'trasparente' : `#${hex}, alpha ${a}`
}

/** Shortcuts are ignored while typing in a text field (checkboxes and color inputs don't count). */
/**
 * A dialog covers the editor: its shortcuts must not act on the canvas underneath. The editor's
 * own shortcuts help (marked `editor-help`) does not count, the editor handles its keys itself.
 */
export function dialogOpen(): boolean {
  return document.querySelector('.modal-backdrop:not(.editor-help)') !== null
}

export function isTyping(event: KeyboardEvent): boolean {
  const target = event.target
  if (target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return true
  return (
    target instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'color', 'range', 'button'].includes(target.type)
  )
}
