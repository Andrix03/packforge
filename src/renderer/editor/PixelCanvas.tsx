import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cssColor, drawCanvas, formatColor, isTyping } from './canvasDraw'
import type { EditorDocument } from './document'
import { pixelCommand, type Command } from './history'
import { fill, getPixel, Stroke, TRANSPARENT, type FillMode, type Rgba } from './pixels'
import { noiseFill, shiftAlongRamp } from './ramp'
import { BRUSH_TOOLS, type ToolId } from './tools'
import {
  clampViewport,
  fitViewport,
  panBy,
  screenToImage,
  screenToPixel,
  zoomAt,
  type Frame,
  type Viewport
} from './viewport'

/** How long a canvas notice stays visible. */
const NOTICE_MS = 3500

export interface Tools {
  tool: ToolId
  pixelPerfect: boolean
  brushSize: number
  /** Shades used by the shade and noise tools, darkest first. */
  ramp: readonly Rgba[]
  fillMode: FillMode
  primary: Rgba
  secondary: Rgba
}

interface PixelCanvasProps {
  doc: EditorDocument
  /** Display copy of the composite, kept up to date by the parent's refresh. */
  source: HTMLCanvasElement
  /** Null when read-only: the canvas can only be zoomed and panned. */
  tools: Tools | null
  /** Bumped by the parent whenever the document changed: redraw. */
  revision: number
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** Pixels of the active layer changed during a stroke (not yet a history step). */
  onPainted: () => void
  /** A finished edit, already applied, to record in the history. */
  onCommit: (command: Command | null) => void
  /** Vanilla texture drawn over the canvas for tracing (display only). */
  trace: { canvas: HTMLCanvasElement; opacity: number } | null
  onPickColor: (slot: 'primary' | 'secondary', color: Rgba) => void
  /** A color was painted with (for the recent colors). */
  onColorUsed: (color: Rgba) => void
  /** The shade or noise tool used the ramp: it must stop following the primary color. */
  onRampUsed: () => void
}

export function PixelCanvas(props: PixelCanvasProps): React.JSX.Element {
  const { doc, source, tools } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewSize, setViewSize] = useState<{ width: number; height: number } | null>(null)
  /** Null until the user zooms or pans: then the texture is fitted to the view. */
  const [storedViewport, setStoredViewport] = useState<Viewport | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  const [panning, setPanning] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)
  /** A short message over the canvas that disappears by itself. */
  const showNotice = (text: string): void => {
    setNotice(text)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS)
  }
  const spaceHeld = useRef(false)
  const drag = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)
  const stroke = useRef<{ pointerId: number; stroke: Stroke } | null>(null)

  const frame = useMemo<Frame | null>(
    () =>
      viewSize && {
        imageWidth: doc.width,
        imageHeight: doc.height,
        viewWidth: viewSize.width,
        viewHeight: viewSize.height
      },
    [viewSize, doc.width, doc.height]
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

  const { revision, trace } = props
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !viewSize || !viewport) return
    canvas.width = viewSize.width
    canvas.height = viewSize.height
    const size = tools && BRUSH_TOOLS.has(tools.tool) ? tools.brushSize : 1
    drawCanvas(canvas, source, viewport, {
      showGrid,
      hover: tools && hover ? { ...hover, size } : null,
      trace
    })
  }, [source, viewSize, viewport, showGrid, hover, tools, revision, trace])

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

  const { onUndo, onRedo } = props
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTyping(event)) return
      const key = event.key.toLowerCase()
      if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) {
        event.preventDefault()
        // Not in the middle of a stroke: it isn't in the history yet.
        if (stroke.current) return
        if (key === 'y' || event.shiftKey) onRedo()
        else onUndo()
      } else if (event.key === 'Alt') {
        // Alt is the temporary color picker: don't let it focus the window menu.
        event.preventDefault()
      } else if (event.code === 'Space') {
        spaceHeld.current = true
        event.preventDefault()
      } else if (event.ctrlKey || event.metaKey) {
        return
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
  }, [zoomCentered, onUndo, onRedo])

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
    if (!tools || !viewport || !frame || (event.button !== 0 && event.button !== 2)) return
    event.preventDefault()
    const point = toDevice(event)
    const pixel = screenToPixel(viewport, point.x, point.y, frame)
    const slot = event.button === 0 ? 'primary' : 'secondary'
    // Alt turns any tool into the color picker while held.
    const tool = event.altKey ? 'picker' : tools.tool
    if (tool === 'picker') {
      // Picks what the user sees (all visible layers).
      if (pixel) props.onPickColor(slot, getPixel(doc.composite, pixel.x, pixel.y))
      return
    }
    const layer = doc.active
    if (!layer.visible) {
      showNotice('Il livello attivo è nascosto: rendilo visibile per disegnarci sopra.')
      return
    }
    if (tool === 'fill' || tool === 'noise') {
      if (!pixel) return
      if (tool === 'fill') props.onColorUsed(tools[slot])
      else props.onRampUsed()
      const changes =
        tool === 'fill'
          ? fill(layer.pixels, pixel.x, pixel.y, tools[slot], tools.fillMode)
          : noiseFill(layer.pixels, pixel.x, pixel.y, tools.ramp, tools.fillMode)
      props.onCommit(pixelCommand(layer.pixels, changes))
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    let current: Stroke
    if (tool === 'shade') {
      props.onRampUsed()
      const ramp = tools.ramp
      const direction = slot === 'primary' ? -1 : 1
      current = new Stroke(
        layer.pixels,
        (before) => shiftAlongRamp(ramp, before, direction),
        false,
        tools.brushSize
      )
    } else {
      const color = tool === 'eraser' ? TRANSPARENT : tools[slot]
      props.onColorUsed(color)
      current = new Stroke(
        layer.pixels,
        color,
        tool === 'pencil' && tools.pixelPerfect,
        tools.brushSize
      )
    }
    stroke.current = { pointerId: event.pointerId, stroke: current }
    if (current.add(screenToImage(viewport, point.x, point.y))) props.onPainted()
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
      if (changed) props.onPainted()
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
      const finished = stroke.current
      stroke.current = null
      props.onCommit(pixelCommand(doc.active.pixels, finished.stroke.changes()))
    }
  }

  const ratio = window.devicePixelRatio || 1
  const zoomPercent = viewport ? Math.round((viewport.zoom / ratio) * 100) : null
  const hoverColor = hover ? getPixel(doc.composite, hover.x, hover.y) : null

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
        <button type="button" onClick={onUndo} disabled={!props.canUndo} title="Annulla (Ctrl+Z)">
          ↶ Annulla
        </button>
        <button type="button" onClick={onRedo} disabled={!props.canRedo} title="Ripeti (Ctrl+Y)">
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
        {notice && (
          <div className="canvas-notice" role="status">
            {notice}
          </div>
        )}
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
