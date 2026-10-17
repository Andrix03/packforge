import { useEffect, useRef, useState } from 'react'
import { parseAnimation } from '../../shared/animation'
import { BlockPreview, type PreviewScene } from './BlockPreview'
import { normalizeHour } from './dayNight'

export interface PreviewTarget {
  /** Changes when the texture or its source changes. */
  key: string
  url: string
  /** URL of the texture's .png.mcmeta, if it has one. */
  mcmetaUrl: string | null
  name: string
  sourceLabel: string
}

const SCENES: Array<{ value: PreviewScene; label: string }> = [
  { value: 'block', label: 'Blocco' },
  { value: 'wall', label: 'Muro 3×3' },
  { value: 'floor', label: 'Pavimento 5×5' }
]

/** Game hours per real second while the day/night cycle plays. */
const CYCLE_SPEED = 1.5

export function PreviewPanel({ target }: { target: PreviewTarget | null }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<BlockPreview | null>(null)
  const [scene, setScene] = useState<PreviewScene>('block')
  const [hour, setHour] = useState(12)
  const [cycling, setCycling] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [info, setInfo] = useState<{ key: string; text: string; error: boolean } | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const preview = new BlockPreview(canvasRef.current)
    previewRef.current = preview
    return () => {
      preview.dispose()
      previewRef.current = null
    }
  }, [])

  useEffect(() => previewRef.current?.setScene(scene), [scene])
  useEffect(() => previewRef.current?.setTime(hour), [hour])
  useEffect(() => previewRef.current?.setAutoRotate(autoRotate), [autoRotate])

  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return
    let current = true
    preview.setTexture(target?.url ?? null).then(
      async (size) => {
        if (!size || !target || !current) return
        const sizeText = `${size.width}×${size.height}`
        if (!target.mcmetaUrl) {
          setInfo({ key: target.key, text: sizeText, error: false })
          return
        }
        let mcmeta: unknown
        try {
          mcmeta = await (await fetch(target.mcmetaUrl)).json()
        } catch {
          mcmeta = undefined
        }
        if (!current) return
        if (mcmeta === undefined) {
          setInfo({
            key: target.key,
            text: `${sizeText} · .png.mcmeta non è un JSON valido`,
            error: true
          })
          return
        }
        const parsed = parseAnimation(mcmeta, size.width, size.height)
        if (!parsed.ok) {
          setInfo({ key: target.key, text: `Animazione non valida: ${parsed.error}`, error: true })
          return
        }
        preview.setAnimation(parsed.animation)
        const animation = parsed.animation
        if (animation?.warning) {
          setInfo({ key: target.key, text: animation.warning, error: true })
          return
        }
        setInfo({
          key: target.key,
          text: animation
            ? `${sizeText} · animata: ${animation.frames.length} frame, ${(animation.totalTicks / 20).toFixed(1)} s${animation.interpolate ? ', sfumata' : ''}`
            : sizeText,
          error: false
        })
      },
      (error: unknown) => {
        if (target && current) {
          setInfo({
            key: target.key,
            text: error instanceof Error ? error.message : String(error),
            error: true
          })
        }
      }
    )
    return () => {
      current = false
    }
  }, [target])

  // Day/night cycle: advance the hour on animation frames while playing.
  useEffect(() => {
    if (!cycling) return
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = (now - last) / 1000
      last = now
      setHour((current) => normalizeHour(current + elapsed * CYCLE_SPEED))
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [cycling])

  // Info belongs to the texture it was computed for.
  const currentInfo = info && target && info.key === target.key ? info : null

  return (
    <aside className="card preview-panel">
      <div className="preview-header">
        {target ? (
          <>
            <strong title={target.name}>{target.name}</strong>
            <span className="muted small">
              {target.sourceLabel}
              {currentInfo && !currentInfo.error && ` · ${currentInfo.text}`}
            </span>
          </>
        ) : (
          <span className="muted">Seleziona una texture per vederla in 3D</span>
        )}
      </div>
      {currentInfo?.error && <span className="field-error small">{currentInfo.text}</span>}

      <canvas ref={canvasRef} className="preview-canvas" aria-label="Anteprima 3D" />

      <div className="tabs small-tabs" role="radiogroup" aria-label="Scena">
        {SCENES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={scene === option.value}
            className={scene === option.value ? 'tab active' : 'tab'}
            onClick={() => setScene(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <label className="preview-control">
        <span>
          Ora del giorno <strong>{formatHour(hour)}</strong>
        </span>
        <input
          type="range"
          min={0}
          max={24}
          step={0.05}
          value={hour}
          onChange={(event) => {
            setCycling(false)
            setHour(normalizeHour(Number(event.target.value)))
          }}
        />
      </label>
      <div className="row wrap">
        <button type="button" onClick={() => setCycling((on) => !on)}>
          {cycling ? '⏸ Ferma ciclo' : '▶ Ciclo giorno/notte'}
        </button>
        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={autoRotate}
            onChange={(event) => setAutoRotate(event.target.checked)}
          />
          Rotazione automatica
        </label>
      </div>
      <span className="muted small">Trascina per ruotare, rotella per lo zoom.</span>
    </aside>
  )
}

function formatHour(hour: number): string {
  const total = Math.round(normalizeHour(hour) * 60) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
