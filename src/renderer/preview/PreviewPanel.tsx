import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BIOMES, DEFAULT_BIOME } from '../../shared/biomeTint'
import type { BlockstateVariant } from '../../shared/blockModel'
import {
  BlockPreview,
  type LiveAnimation,
  type LiveMaps,
  type PartReport,
  type PreviewScene
} from './BlockPreview'
import { loadColormaps, tintFor, type ColormapPixels } from './colormaps'
import type { EffectSettings } from './effects'
import { formatHour, normalizeHour } from './dayNight'
import {
  cubeMesh,
  guessBlockForTexture,
  listBlocks,
  loadBlockMesh,
  type AssetSources,
  type GrowthStage
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

/** A texture being edited: shown from its canvas instead of the file, updated on each stroke. */
export interface LiveTexture {
  url: string
  /** The animation being edited (null = static); omitted = use the file's .png.mcmeta. */
  animation?: LiveAnimation | null
  canvas: HTMLCanvasElement
  /** Bumped after every change painted on the canvas (or on its maps). */
  revision: number
  /** LabPBR maps being edited, shown instead of their files. */
  maps?: LiveMaps | null
  /** Other textures painted together (the upper half of a tall plant), shown live too. */
  extras?: ReadonlyArray<{ url: string; canvas: HTMLCanvasElement }>
}

type Shape = 'cube' | 'block'

const SCENES: Array<{ value: PreviewScene; label: string }> = [
  { value: 'block', label: 'Blocco' },
  { value: 'wall', label: 'Muro 3×3' },
  { value: 'floor', label: 'Pavimento 5×5' }
]

/** Game hours per real second while the day/night cycle plays. */
const CYCLE_SPEED = 1.5
/** Milliseconds per growth stage while the growth plays. */
const GROWTH_STEP_MS = 900

interface Status {
  text: string
  problems: string[]
}

export function PreviewPanel({
  target,
  sources,
  live = null,
  initialShape = 'cube',
  onBlockTextures,
  onGrowthStages,
  onTest = null,
  effects = null
}: {
  /** Growth stages of the block shown (crops, stems…): empty when it does not grow. */
  onGrowthStages?: (stages: GrowthStage[]) => void
  /** LabPBR effects to render with (null = vanilla look). */
  effects?: EffectSettings | null
  target: PreviewTarget | null
  sources: AssetSources | null
  live?: LiveTexture | null
  initialShape?: Shape
  /** Texture paths used by the block model shown (empty for the plain cube). */
  onBlockTextures?: (paths: string[]) => void
  /** Shows a button opening the test screen on the texture. */
  onTest?: (() => void) | null
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<BlockPreview | null>(null)
  const listId = useId()
  const [scene, setScene] = useState<PreviewScene>('block')
  const [hour, setHour] = useState(12)
  const [cycling, setCycling] = useState(false)
  const [autoRotate, setAutoRotate] = useState(false)
  const [shape, setShape] = useState<Shape>(initialShape)
  const [blockInput, setBlockInput] = useState('')
  const [variantKey, setVariantKey] = useState<string | null>(null)
  const [variants, setVariants] = useState<BlockstateVariant[]>([])
  const [stages, setStages] = useState<GrowthStage[]>([])
  /** Variant actually shown (the chosen one, or the stage of the texture). */
  const [shownVariant, setShownVariant] = useState<string | null>(null)
  /** Random model of the variant to draw (null = the one drawing this texture). */
  const [choice, setChoice] = useState<number | null>(null)
  /** The random models of the variant shown: which one is drawn, out of how many. */
  const [choices, setChoices] = useState<{ shown: number; count: number }>({ shown: 0, count: 0 })
  const [growing, setGrowing] = useState(false)
  const [windy, setWindy] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const [biomeId, setBiomeId] = useState(DEFAULT_BIOME.id)
  const biome = BIOMES.find((b) => b.id === biomeId) ?? DEFAULT_BIOME
  /** Colormaps read for the current sources (re-read when the pack changes). */
  const colormapsRef = useRef<{ sources: AssetSources; pixels: Promise<ColormapPixels> } | null>(
    null
  )

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

  const liveUrl = live?.url ?? null
  const liveCanvas = live?.canvas ?? null
  const liveRevision = live?.revision ?? 0
  const liveAnimation = live?.animation
  const liveMaps = live?.maps ?? null
  // Size and animation of the live texture (and which maps are live): when they change the mesh
  // is rebuilt (a GPU texture can't grow in place, and the frames must be re-sliced).
  const liveShape =
    live === null
      ? ''
      : `${liveCanvas?.width}x${liveCanvas?.height}|${
          liveAnimation === undefined
            ? 'file'
            : liveAnimation === null
              ? 'static'
              : `${liveAnimation.frameHeight}/${liveAnimation.frametime}/${liveAnimation.interpolate}`
        }|${mapShape(liveMaps?.normal)}|${mapShape(liveMaps?.specular)}|${(live.extras ?? [])
          .map((extra) => extra.url)
          .join(',')}`
  // Declared before the mesh effect so the override is in place when the mesh loads.
  useEffect(
    () =>
      previewRef.current?.setLiveTexture(
        liveUrl,
        liveCanvas,
        liveAnimation,
        liveMaps,
        live?.extras ?? []
      ),
    // liveShape stands for the animation and maps objects (new objects on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveUrl, liveCanvas, liveShape]
  )
  useEffect(() => previewRef.current?.refreshLiveTextures(), [liveRevision])
  useEffect(() => previewRef.current?.setEffects(effects), [effects])

  useEffect(() => previewRef.current?.setScene(scene), [scene])
  useEffect(() => previewRef.current?.setTime(hour), [hour])
  useEffect(() => previewRef.current?.setAutoRotate(autoRotate), [autoRotate])
  useEffect(() => previewRef.current?.setWind(windy ? 0.6 : 0), [windy])

  // Selecting a texture proposes the block that most likely uses it
  // (state adjusted during render, as React recommends for derived resets).
  const [guessedFor, setGuessedFor] = useState<string | null>(null)
  if (target && target.key !== guessedFor) {
    setGuessedFor(target.key)
    const guess = guessBlockForTexture(target.textureKey, blocks)
    setChoice(null)
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
        if (current) {
          // A plain cube: no block faces, growth stages or variants to offer.
          onBlockTextures?.([])
          onGrowthStages?.([])
          setStages([])
          setVariants([])
        }
        return
      }
      if (!sources || !block) {
        await view.setMesh([])
        if (current) {
          setVariants([])
          setStages([])
          onGrowthStages?.([])
          setStatus(null)
        }
        return
      }
      if (colormapsRef.current?.sources !== sources) {
        colormapsRef.current = { sources, pixels: loadColormaps(sources) }
      }
      const colormaps = await colormapsRef.current.pixels
      if (!current) return
      const mesh = await loadBlockMesh(
        sources,
        block,
        variantKey,
        tintFor(block, biome, colormaps),
        target ? `${target.textureKey}.png` : null,
        choice
      )
      if (!current) return
      const reports = await view.setMesh(mesh.parts)
      if (!current) return
      onBlockTextures?.([...new Set(mesh.parts.flatMap((part) => (part.path ? [part.path] : [])))])
      onGrowthStages?.(mesh.stages)
      setVariants(mesh.variants)
      setStages(mesh.stages)
      setShownVariant(mesh.variant?.key ?? null)
      setChoices({ shown: mesh.choice, count: mesh.choiceWeights.length })
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
    // liveUrl/liveCanvas: the mesh must reload to pick up a new live texture.
  }, [
    shape,
    target,
    sources,
    block,
    variantKey,
    choice,
    biome,
    liveUrl,
    liveCanvas,
    liveShape,
    onBlockTextures,
    onGrowthStages
  ])

  // Growth: step through the stages in age order, starting again from the seed.
  const growthKeys = stages.map((stage) => stage.key).join('|')
  useEffect(() => {
    if (!growing || !growthKeys) return
    const keys = growthKeys.split('|')
    const timer = setInterval(() => {
      setVariantKey((key) => keys[(keys.indexOf(key ?? '') + 1) % keys.length] ?? null)
    }, GROWTH_STEP_MS)
    return () => clearInterval(timer)
  }, [growing, growthKeys])
  const stageIndex = stages.findIndex((stage) => stage.key === shownVariant)
  const showsGrowth = shape === 'block' && block !== null && stages.length > 1

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

      {onTest && (
        <button
          type="button"
          className="small-button"
          onClick={onTest}
          title="Scene, distanza, confronto con vanilla e blocchi vicini"
        >
          🧪 Prova in gioco
        </button>
      )}

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
          <label className="inline-select">
            <span className="muted small">Bioma (erba, foglie)</span>
            <select value={biomeId} onChange={(event) => setBiomeId(event.target.value)}>
              {BIOMES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
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

      {shape === 'block' && block && choices.count > 1 && (
        <div className="choice-bar" role="group" aria-label="Varianti casuali">
          <button
            type="button"
            className="small-button"
            aria-label="Variante precedente"
            onClick={() => setChoice((choices.shown + choices.count - 1) % choices.count)}
          >
            ◀
          </button>
          <span className="small" data-testid="random-choice">
            🎲 Variante {choices.shown + 1} di {choices.count}
          </span>
          <button
            type="button"
            className="small-button"
            aria-label="Variante successiva"
            onClick={() => setChoice((choices.shown + 1) % choices.count)}
          >
            ▶
          </button>
          <span className="muted small">nel gioco: una a caso per blocco</span>
        </div>
      )}
      {showsGrowth && (
        <div className="growth-bar" role="group" aria-label="Crescita">
          <button
            type="button"
            className="small-button"
            aria-pressed={growing}
            onClick={() => setGrowing((on) => !on)}
            title="Mostra gli stadi uno dopo l’altro, come cresce nel gioco"
          >
            {growing ? '⏸ Ferma' : '🌱 Crescita'}
          </button>
          <input
            type="range"
            min={0}
            max={stages.length - 1}
            value={Math.max(0, stageIndex)}
            onChange={(event) => {
              setGrowing(false)
              setVariantKey(stages[Number(event.target.value)]?.key ?? null)
            }}
            aria-label="Stadio di crescita"
          />
          <span className="muted small">
            Stadio {stageIndex + 1}/{stages.length}
          </span>
          <label
            className="checkbox-inline small"
            title="Le piante ondeggiano come con gli shader (Iris): il pack da solo non lo fa"
          >
            <input
              type="checkbox"
              checked={windy}
              onChange={(event) => setWindy(event.target.checked)}
            />
            Vento
          </label>
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

function mapShape(map: { width: number; height: number } | null | undefined): string {
  return map ? `${map.width}x${map.height}` : '-'
}
