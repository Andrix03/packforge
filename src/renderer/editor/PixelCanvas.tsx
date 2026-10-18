import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cssColor, drawCanvas, formatColor, isTyping } from './canvasDraw'
import type { EditorDocument } from './document'
import { pixelCommand, type Command } from './history'
import {
  diffPixels,
  fill,
  fillRegion,
  getPixel,
  Stroke,
  TRANSPARENT,
  type FillMode,
  type Point,
  type Rgba
} from './pixels'
import { noiseFill, shiftAlongRamp } from './ramp'
import { isSelected, maskSelection, outlineSegments, rectSelection } from './selection'
import { lift, moveBy } from './selectionActions'
import { constrainEnd, shapePoints, type ShapeKind } from './shapes'
import { BRUSH_TOOLS, MIRROR_TOOLS, SELECTION_TOOLS, SHAPE_TOOLS, type ToolId } from './tools'
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
  shapeFilled: boolean
  mirror: { x: boolean; y: boolean }
  /** Seamless mode: painting and fills continue across the edges. */
  tiling: boolean
}

/** A shape being dragged: redrawn from the snapshot on every move. */
interface ShapeDrag {
  pointerId: number
  kind: ShapeKind
  start: Point
  color: Rgba
  /** Layer pixels before the shape. */
  snapshot: Uint8ClampedArray
  clip: ((x: number, y: number) => boolean) | null
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
  /** Drops a floating (moved/pasted) piece before another tool changes the layer. */
  onSettle: () => void
  /** Onion skin: row where the previous animation frame starts (null = off). */
  onionY: number | null
  /** Turns seamless mode on/off (absent when read-only). */
  onTiling?: (tiling: boolean) => void
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
  const shape = useRef<ShapeDrag | null>(null)
  /** Rectangle selection being dragged, or the move tool's last pixel. */
  const selectDrag = useRef<{ pointerId: number; start: Point; moved: boolean } | null>(null)
  const moveDrag = useRef<{ pointerId: number; last: Point } | null>(null)

  // The editable area: the whole image, or the animation frame being edited.
  const area = doc.view
  const viewWidth = area.x1 - area.x0 + 1
  const viewHeight = area.y1 - area.y0 + 1
  const frame = useMemo<Frame | null>(
    () =>
      viewSize && {
        imageWidth: viewWidth,
        imageHeight: viewHeight,
        viewWidth: viewSize.width,
        viewHeight: viewSize.height
      },
    [viewSize, viewWidth, viewHeight]
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
    const mirror = tools && MIRROR_TOOLS.has(tools.tool) ? tools.mirror : null
    const outline = doc.selection
      ? outlineSegments(doc.selection.mask, doc.width, doc.height, -area.x0, -area.y0)
      : null
    drawCanvas(canvas, source, viewport, {
      showGrid,
      hover:
        // The last hovered pixel may belong to another frame after switching: hide it then.
        tools &&
        hover &&
        !SELECTION_TOOLS.has(tools.tool) &&
        hover.y >= area.y0 &&
        hover.y <= area.y1
          ? { x: hover.x - area.x0, y: hover.y - area.y0, size }
          : null,
      trace,
      mirror,
      selection: outline,
      tiling: tools?.tiling ?? false,
      region: { x: area.x0, y: area.y0, width: viewWidth, height: viewHeight },
      onion: props.onionY === null ? null : { y: props.onionY }
    })
  }, [
    source,
    viewSize,
    viewport,
    showGrid,
    hover,
    tools,
    revision,
    trace,
    doc,
    area,
    viewWidth,
    viewHeight,
    props.onionY
  ])

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
        if (stroke.current || shape.current || moveDrag.current) return
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
    if (drag.current || stroke.current || shape.current || selectDrag.current || moveDrag.current)
      return
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
    const pixel = pixelAt(point)
    const slot = event.button === 0 ? 'primary' : 'secondary'
    // Alt turns any tool into the color picker while held.
    const tool = event.altKey ? 'picker' : tools.tool
    if (tool === 'picker') {
      // Picks what the user sees (all visible layers).
      if (pixel) props.onPickColor(slot, getPixel(doc.composite, pixel.x, pixel.y))
      return
    }
    if (tool === 'select') {
      props.onSettle()
      event.currentTarget.setPointerCapture(event.pointerId)
      const start = toImage(point.x, point.y)
      selectDrag.current = { pointerId: event.pointerId, start, moved: false }
      doc.selection = rectSelection(doc.width, doc.height, start, start, area)
      props.onPainted()
      return
    }
    if (tool === 'wand') {
      props.onSettle()
      if (pixel) {
        const region = fillRegion(
          doc.active.pixels,
          pixel.x,
          pixel.y,
          tools.fillMode,
          tools.tiling,
          area
        )
        doc.selection = maskSelection(doc.width, doc.height, region)
        props.onPainted()
      }
      return
    }
    if (tool === 'move') {
      if (!doc.active.visible) {
        showNotice('Il livello attivo è nascosto: rendilo visibile per spostarne i pixel.')
        return
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      lift(doc)
      moveDrag.current = {
        pointerId: event.pointerId,
        last: toImage(point.x, point.y)
      }
      props.onPainted()
      return
    }
    // Painting tools put down a moved piece first and stay inside the selection.
    props.onSettle()
    const selection = doc.selection
    const clip = selection ? (x: number, y: number) => isSelected(selection, x, y) : null
    const clipIndex = selection ? (index: number) => selection.mask[index] === 1 : null
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
          ? fill(
              layer.pixels,
              pixel.x,
              pixel.y,
              tools[slot],
              tools.fillMode,
              clipIndex,
              tools.tiling,
              area
            )
          : noiseFill(
              layer.pixels,
              pixel.x,
              pixel.y,
              tools.ramp,
              tools.fillMode,
              Math.random,
              clipIndex,
              tools.tiling,
              area
            )
      props.onCommit(pixelCommand(layer.pixels, changes))
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (SHAPE_TOOLS.has(tool)) {
      const color = tools[slot]
      props.onColorUsed(color)
      shape.current = {
        pointerId: event.pointerId,
        kind: tool as ShapeKind,
        start: toImage(point.x, point.y),
        color,
        snapshot: new Uint8ClampedArray(layer.pixels.data),
        clip
      }
      drawShape(toImage(point.x, point.y), event.shiftKey)
      return
    }
    let current: Stroke
    if (tool === 'shade') {
      props.onRampUsed()
      const ramp = tools.ramp
      const direction = slot === 'primary' ? -1 : 1
      current = new Stroke(layer.pixels, (before) => shiftAlongRamp(ramp, before, direction), {
        size: tools.brushSize,
        mirror: tools.mirror,
        clip,
        wrap: tools.tiling,
        bounds: area
      })
    } else {
      const color = tool === 'eraser' ? TRANSPARENT : tools[slot]
      props.onColorUsed(color)
      current = new Stroke(layer.pixels, color, {
        pixelPerfect: tool === 'pencil' && tools.pixelPerfect,
        size: tools.brushSize,
        mirror: tools.mirror,
        clip,
        wrap: tools.tiling,
        bounds: area
      })
    }
    stroke.current = { pointerId: event.pointerId, stroke: current }
    if (current.add(toImage(point.x, point.y))) props.onPainted()
  }

  /** Image coordinates (inside or outside the editable area) of a device point. */
  function toImage(x: number, y: number): Point {
    const relative = screenToImage(viewport!, x, y)
    return { x: relative.x + area.x0, y: relative.y + area.y0 }
  }

  /** Pixel under a device point; in seamless mode the neighbor copies map back into the area. */
  function pixelAt(point: { x: number; y: number }): Point | null {
    if (!viewport || !frame) return null
    if (!tools?.tiling) {
      const inside = screenToPixel(viewport, point.x, point.y, frame)
      return inside && { x: inside.x + area.x0, y: inside.y + area.y0 }
    }
    const raw = toImage(point.x, point.y)
    return {
      x: area.x0 + ((((raw.x - area.x0) % viewWidth) + viewWidth) % viewWidth),
      y: area.y0 + ((((raw.y - area.y0) % viewHeight) + viewHeight) % viewHeight)
    }
  }

  /** Redraws the dragged shape from its snapshot up to `end`. */
  function drawShape(end: Point, constrain: boolean): void {
    const current = shape.current
    if (!current || !tools) return
    const pixels = doc.active.pixels
    pixels.data.set(current.snapshot)
    const to = constrain ? constrainEnd(current.kind, current.start, end) : end
    const points = shapePoints(current.kind, current.start, to, tools.shapeFilled)
    new Stroke(pixels, current.color, {
      size: tools.brushSize,
      mirror: tools.mirror,
      clip: current.clip,
      wrap: tools.tiling,
      bounds: area
    }).addPoints(points)
    props.onPainted()
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!frame || !viewport) return
    const point = toDevice(event)
    if (shape.current?.pointerId === event.pointerId) {
      drawShape(toImage(point.x, point.y), event.shiftKey)
    }
    const selecting = selectDrag.current
    if (selecting?.pointerId === event.pointerId) {
      const end = toImage(point.x, point.y)
      if (end.x !== selecting.start.x || end.y !== selecting.start.y) selecting.moved = true
      doc.selection = rectSelection(doc.width, doc.height, selecting.start, end, area)
      props.onPainted()
    }
    const moving = moveDrag.current
    if (moving?.pointerId === event.pointerId) {
      const now = toImage(point.x, point.y)
      moveBy(doc, now.x - moving.last.x, now.y - moving.last.y)
      moving.last = now
      props.onPainted()
    }
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
        changed = active.stroke.add(toImage(p.x, p.y)) || changed
      }
      if (changed) props.onPainted()
    }
    const pixel = pixelAt(point)
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
    if (selectDrag.current?.pointerId === event.pointerId) {
      // A click without dragging clears the selection.
      if (!selectDrag.current.moved) doc.selection = null
      selectDrag.current = null
      props.onPainted()
    }
    if (moveDrag.current?.pointerId === event.pointerId) moveDrag.current = null
    if (shape.current?.pointerId === event.pointerId) {
      const finished = shape.current
      shape.current = null
      const pixels = doc.active.pixels
      props.onCommit(pixelCommand(pixels, diffPixels(pixels, finished.snapshot)))
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
        {props.onTiling && (
          <label
            className="inline-check"
            title="Mostra la texture ripetuta e disegna oltre i bordi: quello che esce da un lato rientra dall'altro"
          >
            <input
              type="checkbox"
              checked={tools?.tiling ?? false}
              onChange={(event) => props.onTiling?.(event.target.checked)}
            />
            Bordi continui
          </label>
        )}
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
          // Editable area (x, y, width, height) for UI tests.
          data-view={`${area.x0},${area.y0},${viewWidth},${viewHeight}`}
          className={
            panning
              ? 'editor-canvas panning'
              : tools?.tool === 'move'
                ? 'editor-canvas moving'
                : 'editor-canvas'
          }
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
