import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorTools } from './EditorTools'
import { History } from './history'
import { getPixel, Stroke, TRANSPARENT, type Rgba } from './pixels'
import { toolByShortcut, type ToolId } from './tools'
import {
  clampViewport,
  fitViewport,
  GRID_MIN_ZOOM,
  majorGridStep,
  panBy,
  screenToImage,
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

interface Tools {
  tool: ToolId
  pixelPerfect: boolean
  primary: Rgba
  secondary: Rgba
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
  const [tools, setTools] = useState<Tools>({
    tool: 'pencil',
    pixelPerfect: false,
    primary: [255, 255, 255, 255],
    // Secondary defaults to transparent: right click erases.
    secondary: TRANSPARENT
  })
  const [modified, setModified] = useState(false)
  const swap = useCallback(
    () => setTools((t) => ({ ...t, primary: t.secondary, secondary: t.primary })),
    []
  )

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTyping(event) || event.ctrlKey || event.altKey || event.metaKey) return
      const tool = toolByShortcut(event.key)
      if (tool) setTools((t) => ({ ...t, tool }))
      else if (event.key.toLowerCase() === 'x') swap()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [swap])

  function close(): void {
    // Saving arrives with the "save PNGs in the pack" roadmap item; until then edits are lost.
    if (modified && !window.confirm('Le modifiche non sono salvate e andranno perse. Chiudere?')) {
      return
    }
    onClose()
  }

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
          {modified && (
            <span
              className="badge unsaved"
              title="Le modifiche sono solo in memoria: il salvataggio nel pack arriva nei prossimi passi."
            >
              ● modificata
            </span>
          )}
          {target.readOnly && (
            <span className="badge" title="I pack .zip si aprono in sola lettura.">
              sola lettura
            </span>
          )}
        </div>
        <button type="button" onClick={close}>
          Chiudi editor
        </button>
      </header>
      {loaded.status === 'loading' && <p className="muted">Caricamento della texture…</p>}
      {loaded.status === 'error' && <p className="field-error">{loaded.message}</p>}
      {loaded.status === 'ready' && (
        <div className="editor-main">
          <EditorTools
            tool={tools.tool}
            onTool={(tool) => setTools((t) => ({ ...t, tool }))}
            pixelPerfect={tools.pixelPerfect}
            onPixelPerfect={(pixelPerfect) => setTools((t) => ({ ...t, pixelPerfect }))}
            primary={tools.primary}
            secondary={tools.secondary}
            onPrimary={(primary) => setTools((t) => ({ ...t, primary }))}
            onSecondary={(secondary) => setTools((t) => ({ ...t, secondary }))}
            onSwap={swap}
            disabled={target.readOnly}
          />
          <PixelCanvas
            pixels={loaded.pixels}
            source={loaded.source}
            tools={target.readOnly ? null : tools}
            onModifiedChange={setModified}
          />
        </div>
      )}
    </section>
  )
}

function PixelCanvas({
  pixels,
  source,
  tools,
  onModifiedChange
}: {
  pixels: ImageData
  source: HTMLCanvasElement
  /** Null when read-only: the canvas can only be zoomed and panned. */
  tools: Tools | null
  /** Called when the image starts or stops differing from the file (undo can go back to it). */
  onModifiedChange: (modified: boolean) => void
}): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewSize, setViewSize] = useState<{ width: number; height: number } | null>(null)
  /** Null until the user zooms or pans: then the texture is fitted to the view. */
  const [storedViewport, setStoredViewport] = useState<Viewport | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [panning, setPanning] = useState(false)
  /** Bumped after each painted change so the canvas redraws. */
  const [revision, setRevision] = useState(0)
  const [history] = useState(() => new History())
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const spaceHeld = useRef(false)
  const drag = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)
  const stroke = useRef<{ pointerId: number; stroke: Stroke } | null>(null)

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

  // Fitted until the user zooms or pans; re-clamped on every render so a window resize can't
  // push the texture off screen.
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
    drawCanvas(canvas, source, viewport, showGrid, tools ? hover : null)
  }, [source, viewSize, viewport, showGrid, hover, tools, revision])

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

  /** Copies the edited pixels to the canvas used for display and schedules a redraw. */
  const showChanges = useCallback(() => {
    source.getContext('2d')?.putImageData(pixels, 0, 0)
    setRevision((r) => r + 1)
  }, [source, pixels])

  const syncHistory = useCallback(() => {
    setCanUndo(history.canUndo)
    setCanRedo(history.canRedo)
    onModifiedChange(history.modified)
  }, [history, onModifiedChange])

  const undoRedo = useCallback(
    (action: 'undo' | 'redo') => {
      // Not in the middle of a stroke: it isn't in the history yet.
      if (stroke.current) return
      const done = action === 'undo' ? history.undo(pixels) : history.redo(pixels)
      if (!done) return
      showChanges()
      syncHistory()
    },
    [history, pixels, showChanges, syncHistory]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTyping(event)) return
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
        event.preventDefault()
        undoRedo(key === 'y' || event.shiftKey ? 'redo' : 'undo')
      } else if (event.code === 'Space') {
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
  }, [zoomCentered, undoRedo])

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (drag.current || stroke.current) return
    // Middle button, or Space + left button, pans. Left/right draw with primary/secondary.
    const wantsPan = event.button === 1 || (event.button === 0 && spaceHeld.current)
    if (wantsPan) {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const point = toDevice(event)
      drag.current = { pointerId: event.pointerId, lastX: point.x, lastY: point.y }
      setPanning(true)
      return
    }
    if (!tools || !viewport || (event.button !== 0 && event.button !== 2)) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const color =
      tools.tool === 'eraser' ? TRANSPARENT : event.button === 0 ? tools.primary : tools.secondary
    const current = new Stroke(pixels, color, tools.tool === 'pencil' && tools.pixelPerfect)
    stroke.current = { pointerId: event.pointerId, stroke: current }
    const point = toDevice(event)
    if (current.add(screenToImage(viewport, point.x, point.y))) showChanges()
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
    const active = stroke.current
    if (active?.pointerId === event.pointerId) {
      // Coalesced events keep fast strokes faithful (several samples per frame).
      const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? []
      const samples = coalesced.length > 0 ? coalesced : [event.nativeEvent]
      let changed = false
      for (const sample of samples) {
        const p = toDevice(sample)
        changed = active.stroke.add(screenToImage(viewport, p.x, p.y)) || changed
      }
      if (changed) showChanges()
    }
    const pixel = screenToPixel(viewport, point.x, point.y, frame)
    setHover((previous) =>
      previous?.x === pixel?.x && previous?.y === pixel?.y ? previous : pixel
    )
  }

  function endPointer(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null
      setPanning(false)
    }
    if (stroke.current?.pointerId === event.pointerId) {
      history.push(stroke.current.stroke.changes())
      stroke.current = null
      syncHistory()
    }
  }

  const ratio = window.devicePixelRatio || 1
  const zoomPercent = viewport ? Math.round((viewport.zoom / ratio) * 100) : null
  const hoverColor = hover ? getPixel(pixels, hover.x, hover.y) : null

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
        <button
          type="button"
          onClick={() => undoRedo('undo')}
          disabled={!canUndo}
          title="Annulla (Ctrl+Z)"
        >
          ↶ Annulla
        </button>
        <button
          type="button"
          onClick={() => undoRedo('redo')}
          disabled={!canRedo}
          title="Ripeti (Ctrl+Y)"
        >
          ↷ Ripeti
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
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={() => setHover(null)}
          // Right click paints with the secondary color.
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
      <footer className="editor-status muted small">
        {hover && hoverColor ? (
          <>
            <span>
              x {hover.x}, y {hover.y}
            </span>
            <span className="status-swatch" style={{ background: cssColor(hoverColor) }} />
            <span>{formatColor(hoverColor)}</span>
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
  showGrid: boolean,
  hover: { x: number; y: number } | null
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

  // Outline of the pixel the tool will paint: dark + light so it shows on any color.
  if (hover) {
    const hx = x + hover.x * zoom
    const hy = y + hover.y * zoom
    context.strokeStyle = 'rgba(0, 0, 0, 0.8)'
    context.strokeRect(hx + 0.5, hy + 0.5, zoom - 1, zoom - 1)
    if (zoom >= 4) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      context.strokeRect(hx + 1.5, hy + 1.5, zoom - 3, zoom - 3)
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

/**
 * Decodes the PNG into editable pixels plus a canvas used to draw them scaled. `pixels` is the
 * source of truth for the tools; the canvas is only a display copy.
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

/** Shortcuts are ignored while typing in a text field (checkboxes and color inputs don't count). */
function isTyping(event: KeyboardEvent): boolean {
  const target = event.target
  if (target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return true
  return (
    target instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'color', 'range', 'button'].includes(target.type)
  )
}

function cssColor([r, g, b, a]: Rgba): string {
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`
}

function formatColor([r, g, b, a]: Rgba): string {
  const hex = [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
  return a === 255 ? `#${hex}` : a === 0 ? 'trasparente' : `#${hex} · alpha ${a}`
}
