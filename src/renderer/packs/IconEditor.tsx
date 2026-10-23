import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clampCrop,
  cropRect,
  initialCrop,
  MAX_ZOOM,
  panCrop,
  type SquareCrop
} from '../../shared/crop'
import type { PackSummary } from '../../shared/ipc'
import { RangeInput } from '../ui/components'
import { tr } from '../../shared/i18n'

const VIEWPORT = 256
const OUTPUT_SIZES = [64, 128, 256, 512] as const

interface LoadedImage {
  name: string
  element: HTMLImageElement
}

interface IconEditorProps {
  onCancel: () => void
  onSaved: (pack: PackSummary) => void
}

export function IconEditor({ onCancel, onSaved }: IconEditorProps): React.JSX.Element {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [crop, setCrop] = useState<SquareCrop>({ zoom: 1, centerX: 0, centerY: 0 })
  const [outputSize, setOutputSize] = useState<number>(128)
  const [pixelArt, setPixelArt] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const viewportRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  async function pick(): Promise<void> {
    setError(null)
    const result = await window.api.invoke('pack:pickIconSource')
    if (!result) return
    if (!result.ok) {
      setError(result.error)
      return
    }
    const element = new Image()
    element.onload = () => {
      setImage({ name: result.name, element })
      setCrop(initialCrop(element.naturalWidth, element.naturalHeight))
    }
    element.onerror = () =>
      setError(tr("Impossibile leggere l'immagine: il file potrebbe essere danneggiato."))
    element.src = result.dataUrl
  }

  const rect = useMemo(
    () =>
      image
        ? snap(cropRect(image.element.naturalWidth, image.element.naturalHeight, crop), pixelArt)
        : null,
    [image, crop, pixelArt]
  )

  // The PNG to save, rendered on an offscreen canvas (derived, not state).
  const output = useMemo(() => {
    if (!image || !rect) return null
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = outputSize
    const context = canvas.getContext('2d')
    if (!context) return null
    draw(context, image.element, rect, outputSize, pixelArt)
    return canvas.toDataURL('image/png')
  }, [image, rect, outputSize, pixelArt])

  // The visible crop area is a DOM canvas: drawing it is the effect.
  useEffect(() => {
    const viewport = viewportRef.current?.getContext('2d')
    if (image && rect && viewport) draw(viewport, image.element, rect, VIEWPORT, pixelArt)
  }, [image, rect, pixelArt])

  function setZoom(zoom: number): void {
    if (!image) return
    const { naturalWidth: w, naturalHeight: h } = image.element
    setCrop((current) => clampCrop(w, h, { ...current, zoom }))
  }

  async function save(): Promise<void> {
    if (!output) return
    setBusy(true)
    setError(null)
    const result = await window.api.invoke('pack:setIcon', output.slice(output.indexOf(',') + 1))
    setBusy(false)
    if (result.ok) onSaved(result.pack)
    else setError(result.error)
  }

  return (
    <div className="icon-editor">
      <div className="row">
        <button type="button" onClick={() => void pick()} disabled={busy}>
          {image ? tr('Cambia immagine…') : tr('Scegli immagine…')}
        </button>
        {image && (
          <span className="muted small">
            {image.name}, {image.element.naturalWidth}×{image.element.naturalHeight}
          </span>
        )}
      </div>

      {image && (
        <div className="icon-workspace">
          <canvas
            ref={viewportRef}
            width={VIEWPORT}
            height={VIEWPORT}
            className="icon-viewport"
            aria-label={tr('Area di ritaglio: trascina per spostare, rotella per lo zoom')}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              dragRef.current = { x: event.clientX, y: event.clientY }
            }}
            onPointerMove={(event) => {
              const start = dragRef.current
              if (!start) return
              const { naturalWidth: w, naturalHeight: h } = image.element
              const scale = VIEWPORT / event.currentTarget.clientWidth
              setCrop((current) =>
                panCrop(
                  w,
                  h,
                  current,
                  (event.clientX - start.x) * scale,
                  (event.clientY - start.y) * scale,
                  VIEWPORT
                )
              )
              dragRef.current = { x: event.clientX, y: event.clientY }
            }}
            onPointerUp={() => (dragRef.current = null)}
            onWheel={(event) => setZoom(crop.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15))}
          />

          <div className="icon-controls">
            <label>
              {tr('Zoom')}
              <RangeInput
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.05}
                value={crop.zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
            <label>
              {tr('Dimensione')}
              <select
                value={outputSize}
                onChange={(event) => setOutputSize(Number(event.target.value))}
              >
                {OUTPUT_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}×{size}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={pixelArt}
                onChange={(event) => setPixelArt(event.target.checked)}
              />
              {tr('Pixel art (pixel nitidi, senza sfumature)')}
            </label>

            {output && (
              <div className="icon-previews">
                <span className="muted small">{tr('Anteprima')}</span>
                <div className="row">
                  <img
                    src={output}
                    alt={tr('Anteprima 64 px')}
                    width={64}
                    height={64}
                    className="pixelated checker"
                  />
                  <img
                    src={output}
                    alt={tr('Anteprima 32 px')}
                    width={32}
                    height={32}
                    className="pixelated checker"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <span className="field-error">{error}</span>}
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => void save()}
          disabled={!output || busy}
        >
          {busy ? tr('Salvataggio…') : tr('Salva come pack.png')}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          {tr('Annulla')}
        </button>
      </div>
    </div>
  )
}

/** Pixel art crops snap to whole source pixels so every pixel scales evenly. */
function snap(rect: { sx: number; sy: number; size: number }, pixelArt: boolean) {
  if (!pixelArt) return rect
  const size = Math.max(1, Math.round(rect.size))
  return { sx: Math.round(rect.sx), sy: Math.round(rect.sy), size }
}

function draw(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: { sx: number; sy: number; size: number },
  target: number,
  pixelArt: boolean
): void {
  context.clearRect(0, 0, target, target)
  context.imageSmoothingEnabled = !pixelArt
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, rect.sx, rect.sy, rect.size, rect.size, 0, 0, target, target)
}
