import { useEffect, useRef, useState } from 'react'
import { decodePng } from '../../shared/pngCodec'
import { getPixel, type Rgba } from './pixels'
import { RangeInput } from '../ui/components'

export interface LoadedReference {
  /** Display copy, drawn scaled (also traced over the main canvas). */
  canvas: HTMLCanvasElement
  /** Exact pixels, for color picking. */
  pixels: ImageData
}

/**
 * The vanilla texture with the same path, as a reference only: the user can look at it, trace
 * over it and pick its colors, but its pixels are never copied into the pack.
 */
export function ReferencePanel({
  url,
  label,
  traceOpacity,
  onTraceOpacity,
  onLoaded,
  onPick
}: {
  /** Null when the game has no texture with this path. */
  url: string | null
  label: string
  traceOpacity: number
  onTraceOpacity: (opacity: number) => void
  onLoaded: (reference: LoadedReference | null) => void
  onPick: (slot: 'primary' | 'secondary', color: Rgba) => void
}): React.JSX.Element {
  const [reference, setReference] = useState<LoadedReference | null>(null)
  const [failed, setFailed] = useState(false)
  const displayRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(url)
        const decoded = decodePng(new Uint8Array(await response.arrayBuffer()))
        if (!decoded.ok) throw new Error(decoded.error)
        const { width, height, data } = decoded.image
        const pixels = new ImageData(new Uint8ClampedArray(data), width, height)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d')?.putImageData(pixels, 0, 0)
        if (cancelled) return
        setReference({ canvas, pixels })
        onLoaded({ canvas, pixels })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // onLoaded is a parent callback; reloading only depends on the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  // Drawn into our own canvas (scaled with CSS, pixelated).
  useEffect(() => {
    const display = displayRef.current
    if (!display || !reference) return
    display.width = reference.canvas.width
    display.height = reference.canvas.height
    display.getContext('2d')?.drawImage(reference.canvas, 0, 0)
  }, [reference])

  function pick(event: React.MouseEvent<HTMLDivElement>): void {
    event.preventDefault()
    if (!reference) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * reference.pixels.width)
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * reference.pixels.height)
    if (x < 0 || y < 0 || x >= reference.pixels.width || y >= reference.pixels.height) return
    onPick(event.button === 2 ? 'secondary' : 'primary', getPixel(reference.pixels, x, y))
  }

  return (
    <section className="card reference-panel">
      <div className="row">
        <strong className="small">Riferimento vanilla</strong>
        <span className="muted small">{label}</span>
      </div>
      {!url ? (
        <p className="muted small">Il gioco non ha una texture con questo nome.</p>
      ) : failed ? (
        <p className="field-error small">Impossibile leggere la texture vanilla.</p>
      ) : (
        <>
          <div
            className="reference-image"
            title="Clic sinistro: prendi il colore come primario, destro: come secondario"
            onClick={pick}
            onContextMenu={pick}
          >
            <canvas ref={displayRef} className="reference-canvas checker" />
          </div>
          <label
            className="color-slider"
            title="Mostra la texture vanilla sopra il canvas per ricalcarla"
          >
            <span className="small muted">
              Ricalco sul canvas <span className="slider-value">{traceOpacity}%</span>
            </span>
            <RangeInput
              type="range"
              min={0}
              max={80}
              step={5}
              value={traceOpacity}
              onChange={(event) => onTraceOpacity(Number(event.target.value))}
            />
          </label>
          <p className="muted small">
            Solo riferimento: puoi guardarla, ricalcarla e prenderne i colori, ma i suoi pixel non
            entrano nel pack.
          </p>
        </>
      )}
    </section>
  )
}
