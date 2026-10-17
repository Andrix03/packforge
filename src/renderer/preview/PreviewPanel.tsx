import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { BlockstateVariant } from '../../shared/blockModel'
import { BlockPreview, type PartReport, type PreviewScene } from './BlockPreview'
import { normalizeHour } from './dayNight'
import {
  cubeMesh,
  guessBlockForTexture,
  listBlocks,
  loadBlockMesh,
  type AssetSources
} from './modelSource'

export interface PreviewTarget {
  /** Changes when the texture or its source changes. */
  key: string
  /** Pack-relative path without `.png`, e.g. `assets/minecraft/textures/block/stone`. */
  textureKey: string
  url: string
  /** URL of the texture's .png.mcmeta, if it has one. */
  mcmetaUrl: string | null
  name: string
  sourceLabel: string
}

type Shape = 'cube' | 'block'

const SCENES: Array<{ value: PreviewScene; label: string }> = [
  { value: 'block', label: 'Blocco' },
  { value: 'wall', label: 'Muro 3×3' },
  { value: 'floor', label: 'Pavimento 5×5' }
]

/** Game hours per real second while the day/night cycle plays. */
const CYCLE_SPEED = 1.5

interface Status {
  text: string
  problems: string[]
}

export function PreviewPanel({
  target,
  sources
}: {
  target: PreviewTarget | null
  sources: AssetSources | null
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<BlockPreview | null>(null)
  const listId = useId()
  const [scene, setScene] = useState<PreviewScene>('block')
  const [hour, setHour] = useState(12)
  const [cycling, setCycling] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [shape, setShape] = useState<Shape>('cube')
  const [blockInput, setBlockInput] = useState('')
  const [variantKey, setVariantKey] = useState<string | null>(null)
  const [variants, setVariants] = useState<BlockstateVariant[]>([])
  const [status, setStatus] = useState<Status | null>(null)

  const blocks = useMemo(() => (sources ? listBlocks(sources) : []), [sources])
  const blockSet = useMemo(() => new Set(blocks), [blocks])
  const block = blockSet.has(blockInput.trim()) ? blockInput.trim() : null

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

  // Selecting a texture proposes the block that most likely uses it
  // (state adjusted during render, as React recommends for derived resets).
  const [guessedFor, setGuessedFor] = useState<string | null>(null)
  if (target && target.key !== guessedFor) {
    setGuessedFor(target.key)
    const guess = guessBlockForTexture(target.textureKey, blocks)
    if (guess) {
      setBlockInput(guess)
      setVariantKey(null)
    }
  }

  // Build and show the mesh for the current shape.
  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return
    let current = true

    async function show(view: BlockPreview): Promise<void> {
      if (shape === 'cube') {
        if (!target) {
          await view.setMesh([])
          if (current) setStatus(null)
          return
        }
        const reports = await view.setMesh(cubeMesh(target.key, target.url, target.mcmetaUrl))
        if (current && reports[0]) setStatus(describeTexture(reports[0]))
        return
      }
      if (!sources || !block) {
        await view.setMesh([])
        if (current) {
          setVariants([])
          setStatus(null)
        }
        return
      }
      const mesh = await loadBlockMesh(sources, block, variantKey)
      if (!current) return
      const reports = await view.setMesh(mesh.parts)
      if (!current) return
      setVariants(mesh.variants)
      const animated = reports.filter((r) => r.animation).length
      setStatus({
        text: [
          `${reports.length} texture`,
          animated ? `${animated} animate` : '',
          mesh.variant?.key ?? ''
        ]
          .filter(Boolean)
          .join(' · '),
        problems: [
          ...mesh.warnings,
          ...reports.filter((r) => r.problem).map((r) => `${r.key.split('|')[0]}: ${r.problem}`)
        ]
      })
    }
    void show(preview)
    return () => {
      current = false
    }
  }, [shape, target, sources, block, variantKey])

  // Day/night cycle: advance the hour on animation frames while playing.
  useEffect(() => {
    if (!cycling) return
    let last = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = (now - last) / 1000
      last = now
      setHour((h) => normalizeHour(h + elapsed * CYCLE_SPEED))
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [cycling])

  return (
    <aside className="card preview-panel">
      <div className="preview-header">
        {shape === 'cube' ? (
          target ? (
            <>
              <strong title={target.name}>{target.name}</strong>
              <span className="muted small">
                {target.sourceLabel}
                {status && ` · ${status.text}`}
              </span>
            </>
          ) : (
            <span className="muted">Seleziona una texture per vederla in 3D</span>
          )
        ) : (
          <>
            <strong>{block ?? 'Scegli un blocco'}</strong>
            <span className="muted small">
              {block && status ? status.text : 'Modelli e texture: prima il pack, poi vanilla'}
            </span>
          </>
        )}
      </div>

      <div className="tabs small-tabs" role="radiogroup" aria-label="Forma">
        {(['cube', 'block'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={shape === value}
            className={shape === value ? 'tab active' : 'tab'}
            onClick={() => setShape(value)}
          >
            {value === 'cube' ? 'Cubo' : 'Modello del blocco'}
          </button>
        ))}
      </div>

      {shape === 'block' && (
        <div className="block-picker">
          <input
            list={listId}
            value={blockInput}
            onChange={(event) => {
              setBlockInput(event.target.value)
              setVariantKey(null)
            }}
            placeholder={blocks.length ? 'es. oak_stairs' : 'Nessun blockstate disponibile'}
            aria-label="Blocco"
            aria-invalid={blockInput.trim() !== '' && !block}
            spellCheck={false}
          />
          <datalist id={listId}>
            {blocks.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          {variants.length > 1 && (
            <select
              value={variantKey ?? ''}
              onChange={(event) => setVariantKey(event.target.value || null)}
              aria-label="Variante"
            >
              <option value="">Variante predefinita</option>
              {variants.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.key}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {status?.problems.map((problem) => (
        <span key={problem} className="warning-text small">
          {problem}
        </span>
      ))}

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

function describeTexture(report: PartReport): Status {
  const size = report.size ? `${report.size.width}×${report.size.height}` : ''
  const animation = report.animation
  const text = animation
    ? `${size} · animata: ${animation.frames.length} frame, ${(animation.totalTicks / 20).toFixed(1)} s${animation.interpolate ? ', sfumata' : ''}`
    : size
  return { text, problems: report.problem ? [report.problem] : [] }
}

function formatHour(hour: number): string {
  const total = Math.round(normalizeHour(hour) * 60) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
