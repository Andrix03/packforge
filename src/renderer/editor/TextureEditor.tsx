import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { decodePng } from '../../shared/pngCodec'
import { PreviewPanel, type PreviewTarget } from '../preview/PreviewPanel'
import type { AssetSources } from '../preview/modelSource'
import { addRecent, usedColors } from './color'
import { EditorTools } from './EditorTools'
import { TilingPreview } from './TilingPreview'
import { History } from './history'
import { fill, getPixel, Stroke, TRANSPARENT, type FillMode, type Rgba } from './pixels'
import { DEFAULT_RAMP, generateRamp, noiseFill, shiftAlongRamp, type RampOptions } from './ramp'
import { RampPanel } from './RampPanel'
import { ReferencePanel, type LoadedReference } from './ReferencePanel'
import { assetUrl } from '../../shared/ipc'
import type { EditorMode } from '../../shared/settings'
import { analyzeTexture } from './advice'
import { AdvicePanel } from './AdvicePanel'
import { BRUSH_TOOLS, maxBrushSize, toolByShortcut, type ToolId } from './tools'
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
  /** Path without `.png`, used by the 3D preview to guess the block. */
  textureKey: string
  name: string
  url: string
  mcmetaUrl: string | null
  /** Models and textures for the live 3D preview (pack first, then vanilla). */
  sources: AssetSources
  /** Zip packs are opened read-only. */
  readOnly: boolean
}

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; pixels: ImageData; source: HTMLCanvasElement; reducedFrom16Bit: boolean }

interface Tools {
  tool: ToolId
  pixelPerfect: boolean
  brushSize: number
  /** Shades used by the shade and noise tools, darkest first. */
  ramp: readonly Rgba[]
  fillMode: FillMode
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
    brushSize: 1,
    ramp: [],
    fillMode: 'contiguous',
    primary: [255, 255, 255, 255],
    // Secondary defaults to transparent: right click erases.
    secondary: TRANSPARENT
  })
  const [modified, setModified] = useState(false)
  const [history] = useState(() => new History())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedOnce, setSavedOnce] = useState(false)
  /** Bumped on every painted change, to refresh the live previews. */
  const [revision, setRevision] = useState(0)
  const [recent, setRecent] = useState<Rgba[]>([])
  const [mode, setMode] = useState<EditorMode>('beginner')
  const [proTips, setProTips] = useState(false)
  const [reference, setReference] = useState<LoadedReference | null>(null)
  const [traceOpacity, setTraceOpacity] = useState(0)
  const vanilla = target.sources.vanilla
  const referenceUrl = vanilla?.files.has(target.path) ? assetUrl(vanilla.base, target.path) : null
  const pro = mode === 'pro'
  const showTips = !pro || proTips
  /** Ramp base color; null = follow the primary color until the ramp is used or picked from. */
  const [rampBase, setRampBase] = useState<Rgba | null>(null)
  const [rampOptions, setRampOptions] = useState<RampOptions>(DEFAULT_RAMP)
  const ramp = useMemo(
    () => generateRamp(rampBase ?? tools.primary, rampOptions),
    [rampBase, tools.primary, rampOptions]
  )
  const lockRamp = (): void => setRampBase((base) => base ?? tools.primary)
  const pixels = loaded.status === 'ready' ? loaded.pixels : null
  // Recomputed after every change; cheap even at 64× (a single pass over the pixels).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const palette = useMemo(() => (pixels ? usedColors(pixels) : []), [pixels, revision])
  const advice = useMemo(
    () => (pixels && showTips ? analyzeTexture(pixels) : []),
    // The pixels are mutated in place: `revision` is what tells us they changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pixels, revision, showTips]
  )
  const previewTarget = useMemo<PreviewTarget>(
    () => ({
      key: `editor|${target.url}`,
      textureKey: target.textureKey,
      url: target.url,
      mcmetaUrl: target.mcmetaUrl,
      name: target.name,
      sourceLabel: 'In modifica'
    }),
    [target]
  )
  const swap = useCallback(
    () => setTools((t) => ({ ...t, primary: t.secondary, secondary: t.primary })),
    []
  )

  useEffect(() => {
    let cancelled = false
    void window.api.invoke('settings:get').then(
      (view) => !cancelled && setMode(view.settings.editorMode),
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [])

  function changeMode(next: EditorMode): void {
    setMode(next)
    // Beginner brushes are small: shrink a bigger brush when switching.
    setTools((t) => ({ ...t, brushSize: Math.min(t.brushSize, maxBrushSize(next === 'pro')) }))
    void window.api.invoke('settings:setEditorMode', next)
  }

  useEffect(() => {
    let cancelled = false
    loadPixels(target.url).then(
      (value) => !cancelled && setLoaded({ status: 'ready', ...value }),
      (error: unknown) =>
        !cancelled &&
        setLoaded({
          status: 'error',
          message:
            'Impossibile leggere la texture: ' +
            (error instanceof Error ? error.message : String(error))
        })
    )
    return () => {
      cancelled = true
    }
  }, [target.url])

  const canSave = loaded.status === 'ready' && !target.readOnly
  const save = useCallback(async () => {
    if (loaded.status !== 'ready' || target.readOnly || saving) return
    const { pixels } = loaded
    const version = history.version
    setSaving(true)
    setSaveError(null)
    try {
      // A copy: the user may keep painting while main writes the file.
      const rgba = new Uint8Array(pixels.data)
      const result = await window.api.invoke(
        'texture:save',
        target.path,
        pixels.width,
        pixels.height,
        rgba
      )
      if (!result.ok) {
        setSaveError(result.error)
        return
      }
      // If something changed during the save, the file holds the older state: stay modified.
      if (history.version === version) history.markSaved()
      setModified(history.modified)
      setSavedOnce(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [loaded, target, saving, history])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
        return
      }
      if (isTyping(event) || event.ctrlKey || event.altKey || event.metaKey) return
      const tool = toolByShortcut(event.key)
      if (tool) setTools((t) => ({ ...t, tool }))
      else if (event.key.toLowerCase() === 'x') swap()
      else if (event.key === '[' || event.key === ']') {
        const step = event.key === ']' ? 1 : -1
        setTools((t) => ({
          ...t,
          brushSize: Math.min(maxBrushSize(pro), Math.max(1, t.brushSize + step))
        }))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [swap, save, pro])

  function close(): void {
    if (modified && !window.confirm('Ci sono modifiche non salvate: andranno perse. Chiudere?')) {
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
            <span className="badge unsaved" title="Ci sono modifiche non salvate (Ctrl+S)">
              ● modificata
            </span>
          )}
          {!modified && savedOnce && <span className="success small">Salvata nel pack</span>}
          {loaded.status === 'ready' && loaded.reducedFrom16Bit && (
            <span
              className="badge"
              title="Il file originale ha canali a 16 bit: salvando diventa a 8 bit, come le texture vanilla."
            >
              16 bit → 8 bit
            </span>
          )}
          {target.readOnly && (
            <span className="badge" title="I pack .zip si aprono in sola lettura.">
              sola lettura
            </span>
          )}
        </div>
        <div className="row">
          <div className="tabs small-tabs" role="radiogroup" aria-label="Modalità dell'editor">
            {(
              [
                ['beginner', 'Principiante', 'Meno strumenti, consigli e avvisi'],
                ['pro', 'Pro', 'Tutti gli strumenti e le opzioni']
              ] as const
            ).map(([value, label, title]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                className={mode === value ? 'tab active' : 'tab'}
                title={title}
                onClick={() => changeMode(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {pro && (
            <label
              className="inline-check small"
              title="Mostra consigli e avvisi anche in modalità Pro"
            >
              <input
                type="checkbox"
                checked={proTips}
                onChange={(event) => setProTips(event.target.checked)}
              />
              Consigli
            </label>
          )}
          {saveError && <span className="field-error small">{saveError}</span>}
          {canSave && (
            <button
              type="button"
              className="primary"
              onClick={() => void save()}
              disabled={saving || !modified}
              title="Salva la texture nel pack (Ctrl+S)"
            >
              {saving ? 'Salvataggio…' : 'Salva'}
            </button>
          )}
          <button type="button" onClick={close}>
            Chiudi editor
          </button>
        </div>
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
            brushSize={tools.brushSize}
            onBrushSize={(brushSize) => setTools((t) => ({ ...t, brushSize }))}
            rampPanel={
              <RampPanel
                ramp={ramp}
                options={rampOptions}
                onOptions={setRampOptions}
                locked={rampBase !== null}
                pro={pro}
                onFromPrimary={() => setRampBase(tools.primary)}
                onPick={(slot, color) => {
                  lockRamp()
                  setTools((t) => ({ ...t, [slot]: color }))
                }}
              />
            }
            fillMode={tools.fillMode}
            onFillMode={(fillMode) => setTools((t) => ({ ...t, fillMode }))}
            primary={tools.primary}
            secondary={tools.secondary}
            onColor={(slot, color) => setTools((t) => ({ ...t, [slot]: color }))}
            recent={recent}
            palette={palette}
            onSwap={swap}
            disabled={target.readOnly}
            pro={pro}
            showTips={showTips}
          />
          <PixelCanvas
            pixels={loaded.pixels}
            source={loaded.source}
            tools={target.readOnly ? null : { ...tools, ramp }}
            history={history}
            onModifiedChange={setModified}
            onPixelsChanged={() => setRevision((r) => r + 1)}
            onColorUsed={(color) => setRecent((list) => addRecent(list, color))}
            onRampUsed={lockRamp}
            trace={
              reference && traceOpacity > 0
                ? { canvas: reference.canvas, opacity: traceOpacity / 100 }
                : null
            }
            onPickColor={(slot, color) => setTools((t) => ({ ...t, [slot]: color }))}
          />
          <div className="editor-side">
            {showTips && <AdvicePanel advice={advice} />}
            <PreviewPanel
              target={previewTarget}
              sources={target.sources}
              live={{ url: target.url, canvas: loaded.source, revision }}
              initialShape="block"
            />
            <ReferencePanel
              url={referenceUrl}
              label={vanilla ? '' : 'jar non caricato'}
              traceOpacity={traceOpacity}
              onTraceOpacity={setTraceOpacity}
              onLoaded={setReference}
              onPick={(slot, color) => setTools((t) => ({ ...t, [slot]: color }))}
            />
            <TilingPreview source={loaded.source} revision={revision} />
          </div>
        </div>
      )}
    </section>
  )
}

function PixelCanvas({
  pixels,
  source,
  tools,
  history,
  trace,
  onModifiedChange,
  onPixelsChanged,
  onColorUsed,
  onRampUsed,
  onPickColor
}: {
  pixels: ImageData
  source: HTMLCanvasElement
  /** Null when read-only: the canvas can only be zoomed and panned. */
  tools: Tools | null
  history: History
  /** Vanilla texture drawn over the canvas for tracing (display only). */
  trace: { canvas: HTMLCanvasElement; opacity: number } | null
  /** Called when the image starts or stops differing from the file (undo can go back to it). */
  onModifiedChange: (modified: boolean) => void
  onPickColor: (slot: 'primary' | 'secondary', color: Rgba) => void
  onPixelsChanged: () => void
  /** A color was painted with (for the recent colors). */
  onColorUsed: (color: Rgba) => void
  /** The shade or noise tool used the ramp: it must stop following the primary color. */
  onRampUsed: () => void
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
    const brush = tools && BRUSH_TOOLS.has(tools.tool) ? tools.brushSize : 1
    drawCanvas(canvas, source, viewport, showGrid, tools ? hover : null, brush, trace)
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

  /** Copies the edited pixels to the canvas used for display and schedules a redraw. */
  const showChanges = useCallback(() => {
    source.getContext('2d')?.putImageData(pixels, 0, 0)
    setRevision((r) => r + 1)
    onPixelsChanged()
  }, [source, pixels, onPixelsChanged])

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
      } else if (event.key === 'Alt') {
        // Alt is the temporary color picker: don't let it focus the window menu.
        event.preventDefault()
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
    if (!tools || !viewport || !frame || (event.button !== 0 && event.button !== 2)) return
    event.preventDefault()
    const point = toDevice(event)
    const pixel = screenToPixel(viewport, point.x, point.y, frame)
    const slot = event.button === 0 ? 'primary' : 'secondary'
    // Alt turns any tool into the color picker while held.
    const tool = event.altKey ? 'picker' : tools.tool
    if (tool === 'picker') {
      if (pixel) onPickColor(slot, getPixel(pixels, pixel.x, pixel.y))
      return
    }
    if (tool === 'fill' || tool === 'noise') {
      if (!pixel) return
      if (tool === 'fill') onColorUsed(tools[slot])
      else onRampUsed()
      history.push(
        tool === 'fill'
          ? fill(pixels, pixel.x, pixel.y, tools[slot], tools.fillMode)
          : noiseFill(pixels, pixel.x, pixel.y, tools.ramp, tools.fillMode)
      )
      showChanges()
      syncHistory()
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    let current: Stroke
    if (tool === 'shade') {
      onRampUsed()
      const ramp = tools.ramp
      const direction = slot === 'primary' ? -1 : 1
      current = new Stroke(
        pixels,
        (before) => shiftAlongRamp(ramp, before, direction),
        false,
        tools.brushSize
      )
    } else {
      const color = tool === 'eraser' ? TRANSPARENT : tools[slot]
      onColorUsed(color)
      current = new Stroke(pixels, color, tool === 'pencil' && tools.pixelPerfect, tools.brushSize)
    }
    stroke.current = { pointerId: event.pointerId, stroke: current }
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
  hover: { x: number; y: number } | null,
  brushSize: number,
  trace: { canvas: HTMLCanvasElement; opacity: number } | null
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
  if (trace) {
    // Scaled to the texture size (a 16× reference over a 32× texture still lines up).
    context.globalAlpha = trace.opacity
    context.drawImage(trace.canvas, x, y, width, height)
    context.globalAlpha = 1
  }

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

  // Outline of the pixels the tool will paint (same footprint as Stroke's brush): dark + light so
  // it shows on any color.
  if (hover) {
    const offset = Math.floor((brushSize - 1) / 2)
    const hx = x + (hover.x - offset) * zoom
    const hy = y + (hover.y - offset) * zoom
    const side = brushSize * zoom
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

/**
 * Decodes the PNG exactly (shared codec, straight alpha) into the editable pixels, plus a canvas
 * used only to draw them scaled: a 2D canvas stores premultiplied alpha, so it is never read back.
 */
async function loadPixels(
  url: string
): Promise<{ pixels: ImageData; source: HTMLCanvasElement; reducedFrom16Bit: boolean }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const decoded = decodePng(new Uint8Array(await response.arrayBuffer()))
  if (!decoded.ok) throw new Error(decoded.error)
  const { width, height, data, reducedFrom16Bit } = decoded.image
  const pixels = new ImageData(new Uint8ClampedArray(data), width, height)
  const source = document.createElement('canvas')
  source.width = width
  source.height = height
  source.getContext('2d')?.putImageData(pixels, 0, 0)
  return { pixels, source, reducedFrom16Bit }
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
