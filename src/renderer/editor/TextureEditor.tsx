import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clampViewport,
  fitViewport,
  GRID_MIN_ZOOM,
  majorGridStep,
  panBy,
  screenToPixel,
  zoomAt,
  type Frame,
  type Viewport
} from './viewport'

export interface EditorTarget {
  /** Pack-relative path of the albedo PNG. */
  path: string
  name: string
  url: string
  /** Zip packs are opened read-only. */
  readOnly: boolean
}

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; pixels: ImageData; source: HTMLCanvasElement }

interface Hover {
  x: number
  y: number
  rgba: [number, number, number, number]
}

/** Size of the transparency checkerboard squares, in CSS pixels. */
const CHECKER_SIZE = 8

export function TextureEditor({
  target,
  onClose
}: {
  target: EditorTarget
  onClose: () => void
}): React.JSX.Element {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadPixels(target.url).then(
      (value) => !cancelled && setLoaded({ status: 'ready', ...value }),
      () => !cancelled && setLoaded({ status: 'error', message: 'Impossibile leggere la texture.' })
    )
    return () => {
      cancelled = true
    }
  }, [target.url])

  return (
    <section className="editor">
      <header className="editor-header">
        <div>
          <strong>{target.name}</strong>
          <span className="muted small"> {target.path}</span>
          {loaded.status === 'ready' && (
            <span className="badge">
              {loaded.pixels.width}×{loaded.pixels.height}
            </span>
          )}
          {target.readOnly && (
            <span className="badge" title="I pack .zip si aprono in sola lettura.">
              sola lettura
            </span>
          )}
        </div>
        <button type="button" onClick={onClose}>
          Chiudi editor
        </button>
      </header>
      {loaded.status === 'loading' && <p className="muted">Caricamento della texture…</p>}
      {loaded.status === 'error' && <p className="field-error">{loaded.message}</p>}
      {loaded.status === 'ready' && <PixelCanvas pixels={loaded.pixels} source={loaded.source} />}
    </section>
  )
}

function PixelCanvas({
  pixels,
  source
}: {
  pixels: ImageData
  source: HTMLCanvasElement
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewSize, setViewSize] = useState<{ width: number; height: number } | null>(null)
  /** Null until the user zooms or pans: then the texture is fitted to the view. */
  const [storedViewport, setStoredViewport] = useState<Viewport | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [hover, setHover] = useState<Hover | null>(null)
  const [panning, setPanning] = useState(false)
  const spaceHeld = useRef(false)
  const drag = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)

  const frame = useMemo<Frame | null>(
    () =>
      viewSize && {
        imageWidth: pixels.width,
        imageHeight: pixels.height,
        viewWidth: viewSize.width,
        viewHeight: viewSize.height
      },
    [viewSize, pixels.width, pixels.height]
  )

  // The canvas backing store follows the container size in device pixels.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      const ratio = window.devicePixelRatio || 1
      setViewSize({
        width: Math.max(1, Math.round(container.clientWidth * ratio)),
        height: Math.max(1, Math.round(container.clientHeight * ratio))
      })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Fit on first layout; afterwards a resize only re-clamps the current view.
  // Re-clamped on every render so a window resize can't push the texture off screen.
  const viewport =
    frame && (storedViewport ? clampViewport(storedViewport, frame) : fitViewport(frame))

  const updateViewport = useCallback(
    (change: (current: Viewport, frame: Frame) => Viewport) => {
      if (!frame) return
      setStoredViewport((previous) =>
        change(previous ? clampViewport(previous, frame) : fitViewport(frame), frame)
      )
    },
    [frame]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !viewSize || !viewport) return
    canvas.width = viewSize.width
    canvas.height = viewSize.height
    drawCanvas(canvas, source, viewport, showGrid)
  }, [source, viewSize, viewport, showGrid])

  const zoomCentered = useCallback(
    (direction: 1 | -1) =>
      updateViewport((v, f) => zoomAt(v, direction, f.viewWidth / 2, f.viewHeight / 2, f)),
    [updateViewport]
  )

  const toDevice = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    return { x: (event.clientX - rect.left) * ratio, y: (event.clientY - rect.top) * ratio }
  }, [])

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const point = toDevice(event)
      updateViewport((v, f) => zoomAt(v, event.deltaY < 0 ? 1 : -1, point.x, point.y, f))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [updateViewport, toDevice])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
        return
      }
      if (event.code === 'Space') {
        spaceHeld.current = true
        event.preventDefault()
      } else if (event.key === '+' || event.key === '=') {
        zoomCentered(1)
      } else if (event.key === '-') {
        zoomCentered(-1)
      } else if (event.key === '0') {
        setStoredViewport(null)
      }
    }
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') spaceHeld.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [zoomCentered])

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    // Middle button, or Space + left button, pans. Left/right are kept for the drawing tools.
    const wantsPan = event.button === 1 || (event.button === 0 && spaceHeld.current)
    if (!wantsPan) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = toDevice(event)
    drag.current = { pointerId: event.pointerId, lastX: point.x, lastY: point.y }
    setPanning(true)
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!frame || !viewport) return
    const point = toDevice(event)
    const current = drag.current
    if (current && current.pointerId === event.pointerId) {
      const dx = point.x - current.lastX
      const dy = point.y - current.lastY
      current.lastX = point.x
      current.lastY = point.y
      updateViewport((v, f) => panBy(v, dx, dy, f))
      return
    }
    const pixel = screenToPixel(viewport, point.x, point.y, frame)
    setHover(pixel && { ...pixel, rgba: readPixel(pixels, pixel.x, pixel.y) })
  }

  function endDrag(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (drag.current?.pointerId !== event.pointerId) return
    drag.current = null
    setPanning(false)
  }

  const ratio = window.devicePixelRatio || 1
  const zoomPercent = viewport ? Math.round((viewport.zoom / ratio) * 100) : null

  return (
    <div className="editor-body">
      <div className="editor-toolbar">
        <button
          type="button"
          onClick={() => setStoredViewport(null)}
          title="Adatta alla finestra (0)"
        >
          Adatta
        </button>
        <button
          type="button"
          onClick={() => zoomCentered(-1)}
          title="Riduci (−)"
          aria-label="Riduci"
        >
          −
        </button>
        <span className="zoom-label">{zoomPercent !== null ? `${zoomPercent}%` : '—'}</span>
        <button
          type="button"
          onClick={() => zoomCentered(1)}
          title="Ingrandisci (+)"
          aria-label="Ingrandisci"
        >
          +
        </button>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
          />
          Griglia
        </label>
        <span className="muted small">
          Rotellina: zoom · tasto centrale o Spazio + trascina: sposta
        </span>
      </div>
      <div ref={containerRef} className="editor-canvas-wrap">
        <canvas
          ref={canvasRef}
          className={panning ? 'editor-canvas panning' : 'editor-canvas'}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => setHover(null)}
          // Right click is reserved for the secondary color.
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
      <footer className="editor-status muted small">
        {hover ? (
          <>
            <span>
              x {hover.x}, y {hover.y}
            </span>
            <span className="status-swatch" style={{ background: cssColor(hover.rgba) }} />
            <span>{formatColor(hover.rgba)}</span>
          </>
        ) : (
          <span>Passa sopra la texture per vedere coordinate e colore.</span>
        )}
      </footer>
    </div>
  )
}

function drawCanvas(
  canvas: HTMLCanvasElement,
  source: HTMLCanvasElement,
  viewport: Viewport,
  showGrid: boolean
): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const { zoom, x, y } = viewport
  const width = source.width * zoom
  const height = source.height * zoom
  const style = getComputedStyle(canvas)
  context.fillStyle = style.getPropertyValue('--bg').trim() || '#1b1d22'
  context.fillRect(0, 0, canvas.width, canvas.height)

  // Checkerboard under the texture so transparent pixels are visible.
  const check = Math.max(1, Math.round(CHECKER_SIZE * (window.devicePixelRatio || 1)))
  context.save()
  context.beginPath()
  context.rect(x, y, width, height)
  context.clip()
  context.fillStyle = '#8c8c8c'
  context.fillRect(x, y, width, height)
  context.fillStyle = '#707070'
  for (let row = 0; row * check < height; row++) {
    for (let col = row % 2; col * check < width; col += 2) {
      context.fillRect(x + col * check, y + row * check, check, check)
    }
  }
  context.restore()

  context.imageSmoothingEnabled = false
  context.drawImage(source, x, y, width, height)

  if (showGrid && zoom >= GRID_MIN_ZOOM) {
    strokeGrid(context, viewport, source.width, source.height, 1, 'rgba(0, 0, 0, 0.22)')
  }
  const major = majorGridStep(source.width)
  if (showGrid && major !== null && zoom * major >= GRID_MIN_ZOOM) {
    strokeGrid(context, viewport, source.width, source.height, major, 'rgba(0, 0, 0, 0.5)')
  }
  context.strokeStyle = 'rgba(255, 255, 255, 0.25)'
  context.lineWidth = 1
  context.strokeRect(x - 0.5, y - 0.5, width + 1, height + 1)
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

/**
 * Decodes the PNG into editable pixels plus a canvas used to draw them scaled.
 * TODO(save): a 2D canvas stores premultiplied alpha, so semi-transparent pixels can be off by a
 * few units; decode exactly before edits are written back to the pack.
 */
async function loadPixels(url: string): Promise<{ pixels: ImageData; source: HTMLCanvasElement }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  // No color management: texture pixels must keep their stored values.
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none'
  })
  const source = document.createElement('canvas')
  source.width = bitmap.width
  source.height = bitmap.height
  const context = source.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('2D canvas unavailable')
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return { pixels: context.getImageData(0, 0, source.width, source.height), source }
}

function readPixel(pixels: ImageData, x: number, y: number): [number, number, number, number] {
  const i = (y * pixels.width + x) * 4
  const d = pixels.data
  return [d[i]!, d[i + 1]!, d[i + 2]!, d[i + 3]!]
}

function cssColor([r, g, b, a]: readonly number[]): string {
  return `rgba(${r}, ${g}, ${b}, ${(a ?? 255) / 255})`
}

function formatColor([r, g, b, a]: readonly [number, number, number, number]): string {
  const hex = [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
  return a === 255 ? `#${hex}` : a === 0 ? 'trasparente' : `#${hex} · alpha ${a}`
}
