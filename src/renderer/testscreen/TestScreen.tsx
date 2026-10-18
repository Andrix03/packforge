import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BIOMES, DEFAULT_BIOME } from '../../shared/biomeTint'
import type { EditorTarget } from '../editor/TextureEditor'
import { BlockPreview, type LiveAnimation } from '../preview/BlockPreview'
import { loadColormaps, tintFor, type ColormapPixels } from '../preview/colormaps'
import { formatHour, normalizeHour } from '../preview/dayNight'
import {
  DEBUG_VIEWS,
  SHADOW_MODES,
  DEFAULT_EFFECTS,
  TONE_MAPPINGS,
  type EffectSettings,
  type ShadowMode,
  type ToneMappingId
} from '../preview/effects'
import { LIGHTING_PRESETS, type LightingPresetId } from '../preview/lightingPresets'
import {
  guessBlockForTexture,
  labPbrUrls,
  listBlocks,
  resolveAssetUrl
} from '../preview/modelSource'
import {
  BLOCK_SCENES,
  DEFAULT_NEIGHBOURS,
  HAND_SCENE,
  MINE,
  sceneByKind,
  type SceneKind
} from '../preview/testScenes'
import { ItemSlots } from './ItemSlots'
import {
  buildWorld,
  itemMesh,
  loadHandDisplay,
  loadMine,
  loadSprite,
  vanillaOnly,
  type Sprite,
  type TintOf
} from './testWorld'

/** The texture as it is in the editor, unsaved changes included. */
export interface TestLive {
  canvas: HTMLCanvasElement
  /** undefined = use the file's .png.mcmeta. */
  animation: LiveAnimation | null | undefined
  /** Exact pixels of the composite (straight alpha), for the item's shape. */
  pixels: Sprite
}

/** Game hours per real second while the day/night cycle plays. */
const CYCLE_SPEED = 1.5
const MAX_DISTANCE = 80

interface Status {
  text: string
  problems: string[]
}

/**
 * Test screen: the texture as it will look in game, in scenes, from far away, next to other
 * blocks and to vanilla; item textures in hand and in the inventory.
 */
export function TestScreen({
  target,
  live,
  onBack,
  onClose
}: {
  target: EditorTarget
  live: TestLive | null
  /** Back to the editor on this texture. */
  onBack: () => void
  /** Closes the test screen when it was opened from the pack (null: only "back to drawing"). */
  onClose: (() => void) | null
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<BlockPreview | null>(null)
  const listId = useId()
  const isItem = target.path.includes('/textures/item/')
  const sources = target.sources
  const vanillaSources = useMemo(() => vanillaOnly(sources), [sources])
  const blocks = useMemo(() => listBlocks(sources), [sources])
  const blockSet = useMemo(() => new Set(blocks), [blocks])

  const [blockInput, setBlockInput] = useState(
    () => guessBlockForTexture(target.textureKey, blocks) ?? ''
  )
  const block = blockSet.has(blockInput.trim()) ? blockInput.trim() : null
  const [sceneKind, setSceneKind] = useState<SceneKind>(isItem ? 'hand' : 'block')
  const scene = sceneByKind(sceneKind)
  const [neighbours, setNeighbours] = useState<string[]>(DEFAULT_NEIGHBOURS)
  const [biomeId, setBiomeId] = useState(DEFAULT_BIOME.id)
  const biome = BIOMES.find((b) => b.id === biomeId) ?? DEFAULT_BIOME
  const [hour, setHour] = useState(12)
  const [cycling, setCycling] = useState(false)
  const defaultDistance = Math.hypot(...scene.camera)
  const [distance, setDistance] = useState(defaultDistance)
  // A new scene starts from its own camera distance (state adjusted during render).
  const [distanceFor, setDistanceFor] = useState(sceneKind)
  if (distanceFor !== sceneKind) {
    setDistanceFor(sceneKind)
    setDistance(defaultDistance)
  }
  const [mipmaps, setMipmaps] = useState(true)
  const [compare, setCompare] = useState(false)
  const comparing = compare && vanillaSources !== null
  const [fly, setFly] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)
  const colormapsRef = useRef<Promise<ColormapPixels> | null>(null)
  const vanillaItemUrl =
    isItem && vanillaSources ? resolveAssetUrl(vanillaSources, target.path) : null
  const maps = useMemo(() => labPbrUrls(sources, target.path), [sources, target.path])
  // Effects start on when the texture has LabPBR maps to show.
  const [effectsOn, setEffectsOn] = useState(
    () => maps.normalUrl !== null || maps.specularUrl !== null
  )
  const [effects, setEffects] = useState<EffectSettings>(DEFAULT_EFFECTS)
  const updateEffects = (change: Partial<EffectSettings>): void =>
    setEffects((old) => ({ ...old, ...change }))
  const preset = LIGHTING_PRESETS.find((p) => p.id === effects.lighting) ?? LIGHTING_PRESETS[0]!
  const followsHour = !effectsOn || effects.lighting === 'time'

  useEffect(() => {
    if (!canvasRef.current) return
    const preview = new BlockPreview(canvasRef.current)
    previewRef.current = preview
    return () => {
      preview.dispose()
      previewRef.current = null
    }
  }, [])

  // Declared before the world effects so the unsaved texture is used when they load.
  useEffect(
    () =>
      previewRef.current?.setLiveTexture(
        live ? target.url : null,
        live?.canvas ?? null,
        live?.animation
      ),
    [live, target.url]
  )
  useEffect(() => previewRef.current?.setTime(hour), [hour])
  useEffect(() => previewRef.current?.setEffects(effectsOn ? effects : null), [effectsOn, effects])
  useEffect(() => previewRef.current?.setMipmaps(mipmaps), [mipmaps])
  useEffect(() => previewRef.current?.setFly(fly), [fly])
  useEffect(() => previewRef.current?.setView(scene.focus, scene.camera, scene.fov), [scene])
  useEffect(() => previewRef.current?.setDistance(distance), [distance])

  // The scene's blocks: the tested one (MINE) from the pack, the others pack first then vanilla.
  useEffect(() => {
    const preview = previewRef.current
    if (!preview) return
    let current = true
    colormapsRef.current ??= loadColormaps(sources)
    const colormaps = colormapsRef.current

    async function show(view: BlockPreview): Promise<void> {
      const pixels = await colormaps
      const tintOf: TintOf = (name) => tintFor(name, biome, pixels)
      const placements = scene
        .build(neighbours.filter((name) => blockSet.has(name)))
        .filter((p) => p.block === MINE || blockSet.has(p.block))
      const mine = isItem ? null : await loadMine(sources, block, target.path, tintOf)
      const theirs =
        comparing && vanillaSources && !isItem
          ? await loadMine(vanillaSources, block, target.path, tintOf)
          : null
      const [world, vanillaWorld] = await Promise.all([
        buildWorld(sources, placements, mine, tintOf),
        comparing && vanillaSources ? buildWorld(vanillaSources, placements, theirs, tintOf) : null
      ])
      if (!current) return
      const report = await view.setWorld(world, vanillaWorld)
      if (!current) return
      const problems = [
        ...(mine?.warnings ?? []),
        ...report.main.filter((r) => r.problem).map((r) => `${r.key.split('|')[0]}: ${r.problem}`)
      ]
      if (comparing && !isItem && !theirs) {
        problems.push('Vanilla non ha questo blocco: a destra ci sono solo gli altri blocchi.')
      }
      setStatus({
        text: `${placements.length} ${placements.length === 1 ? 'blocco' : 'blocchi'} · ${world.length} ${world.length === 1 ? 'tipo' : 'tipi'}`,
        problems: [...new Set(problems)]
      })
    }
    void show(preview)
    return () => {
      current = false
    }
  }, [
    scene,
    neighbours,
    blockSet,
    block,
    biome,
    comparing,
    isItem,
    sources,
    vanillaSources,
    target.path
  ])

  // Items: the sprite extruded like the game, in the right hand.
  useEffect(() => {
    const preview = previewRef.current
    if (!preview || !isItem) return
    let current = true

    async function show(view: BlockPreview): Promise<void> {
      const sprite = live?.pixels ?? (await loadSprite(target.url))
      const display = await loadHandDisplay(sources, target.name)
      const theirs = comparing && vanillaItemUrl ? await loadSprite(vanillaItemUrl) : null
      if (!current) return
      const frameHeight = live?.animation ? live.animation.frameHeight : null
      await view.setHeld(
        sprite
          ? itemMesh(target.path, target.url, target.mcmetaUrl, sprite, frameHeight, maps)
          : null,
        theirs && vanillaItemUrl && vanillaSources
          ? itemMesh(
              'vanilla',
              vanillaItemUrl,
              resolveAssetUrl(vanillaSources, `${target.path}.mcmeta`),
              theirs,
              null
            )
          : null,
        display
      )
    }
    void show(preview)
    return () => {
      current = false
    }
  }, [isItem, live, target, sources, comparing, vanillaItemUrl, vanillaSources, maps])

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

  const scenes = isItem ? [HAND_SCENE] : BLOCK_SCENES

  return (
    <section className="test-screen">
      <header className="editor-header">
        <div>
          <strong>Prova: {target.name}</strong>
          <span className="muted small"> {target.path}</span>
          {live && (
            <span className="badge" title="La prova usa la texture così com'è nell'editor">
              con le modifiche non salvate
            </span>
          )}
        </div>
        <div className="row">
          <button type="button" className="primary" onClick={onBack}>
            ✏ Torna a disegnare
          </button>
          {onClose && (
            <button type="button" onClick={onClose}>
              Chiudi prova
            </button>
          )}
        </div>
      </header>

      <div className="test-body">
        <div className="test-view">
          <div
            className={['test-canvas-wrap', isItem && 'game-screen', comparing && 'comparing']
              .filter(Boolean)
              .join(' ')}
          >
            <div className="test-canvas-box">
              <canvas ref={canvasRef} className="test-canvas" aria-label="Prova 3D" />
              {comparing && (
                <>
                  <div className="test-divider" />
                  <span className="test-label left">Il tuo pack</span>
                  <span className="test-label right">Vanilla</span>
                </>
              )}
            </div>
          </div>
          <span className="muted small test-help">
            {fly
              ? 'Volo libero: trascina per guardarti intorno, W A S D per muoverti, Spazio e Maiusc per salire e scendere.'
              : 'Trascina per ruotare, rotella per avvicinarti.'}{' '}
            {scene.hint}
          </span>
          {isItem && (
            <ItemSlots
              mine={live?.canvas ?? target.url}
              vanilla={vanillaItemUrl}
              frameHeight={live?.animation ? live.animation.frameHeight : null}
            />
          )}
        </div>

        <aside className="card test-side">
          <section className="test-section">
            <strong>Scena</strong>
            <div className="tabs small-tabs wrap" role="radiogroup" aria-label="Scena">
              {scenes.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  role="radio"
                  aria-checked={sceneKind === option.kind}
                  className={sceneKind === option.kind ? 'tab active' : 'tab'}
                  onClick={() => setSceneKind(option.kind)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {!isItem && (
              <label className="test-field">
                <span className="muted small">Blocco provato (vuoto = la texture su un cubo)</span>
                <input
                  list={listId}
                  value={blockInput}
                  onChange={(event) => setBlockInput(event.target.value)}
                  placeholder="es. stone"
                  aria-label="Blocco provato"
                  aria-invalid={blockInput.trim() !== '' && !block}
                  spellCheck={false}
                />
              </label>
            )}
            {sceneKind === 'mixed' && (
              <div className="test-neighbours">
                <span className="muted small">Blocchi vicini (prima il pack, poi vanilla)</span>
                {neighbours.map((name, index) => (
                  <input
                    key={index}
                    list={listId}
                    value={name}
                    aria-label={`Blocco vicino ${index + 1}`}
                    aria-invalid={name.trim() !== '' && !blockSet.has(name.trim())}
                    spellCheck={false}
                    onChange={(event) =>
                      setNeighbours((list) =>
                        list.map((old, i) => (i === index ? event.target.value.trim() : old))
                      )
                    }
                  />
                ))}
              </div>
            )}
            <datalist id={listId}>
              {blocks.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {status && <span className="muted small">{status.text}</span>}
            {status?.problems.map((problem) => (
              <span key={problem} className="warning-text small">
                {problem}
              </span>
            ))}
          </section>

          <section className="test-section">
            <strong>Vista</strong>
            {!isItem && (
              <label className="preview-control">
                <span>
                  Distanza <strong>{Math.round(distance)} blocchi</strong>
                </span>
                <input
                  type="range"
                  min={1}
                  max={MAX_DISTANCE}
                  step={0.5}
                  value={Math.min(distance, MAX_DISTANCE)}
                  disabled={fly}
                  aria-label="Distanza"
                  onChange={(event) => setDistance(Number(event.target.value))}
                />
              </label>
            )}
            {!isItem && (
              <label
                className="checkbox-inline"
                title="Come nel gioco (livelli mipmap: 4): da lontano i dettagli si fondono in un colore medio"
              >
                <input
                  type="checkbox"
                  checked={mipmaps}
                  onChange={(event) => setMipmaps(event.target.checked)}
                />
                Mipmap come nel gioco
              </label>
            )}
            <label
              className="checkbox-inline"
              title={vanillaSources ? '' : 'Carica il jar vanilla dalla scheda Vanilla del pack'}
            >
              <input
                type="checkbox"
                checked={comparing}
                disabled={!vanillaSources}
                onChange={(event) => setCompare(event.target.checked)}
              />
              Confronta con vanilla (affiancato)
            </label>
            <button type="button" aria-pressed={fly} onClick={() => setFly((on) => !on)}>
              {fly ? '⟲ Torna a ruotare' : '🕊 Volo libero'}
            </button>
          </section>

          <section className="test-section">
            <strong>Luce e bioma</strong>
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
                disabled={!followsHour}
                aria-label="Ora del giorno"
                onChange={(event) => {
                  setCycling(false)
                  setHour(normalizeHour(Number(event.target.value)))
                }}
              />
            </label>
            <button type="button" disabled={!followsHour} onClick={() => setCycling((on) => !on)}>
              {cycling ? '⏸ Ferma ciclo' : '▶ Ciclo giorno/notte'}
            </button>
            {!followsHour && (
              <span className="muted small">
                La luce segue il preset degli effetti (scegli «Ora del giorno» per usare l’ora).
              </span>
            )}
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
          </section>

          <section className="test-section">
            <strong>Effetti (LabPBR)</strong>
            <label
              className="checkbox-inline"
              title="Come con uno shader LabPBR (Iris): normali, riflessi, metalli, emissione"
            >
              <input
                type="checkbox"
                checked={effectsOn}
                onChange={(event) => setEffectsOn(event.target.checked)}
              />
              Mostra effetti
            </label>
            <span className="muted small" aria-label="Mappe LabPBR">
              Mappe di questa texture: {maps.normalUrl ? '✓' : '✗'} _n (normali){' '}
              {maps.specularUrl ? '✓' : '✗'} _s (materiale)
            </span>
            {effectsOn && (
              <>
                <label className="inline-select">
                  <span className="muted small">Luce</span>
                  <select
                    value={effects.lighting}
                    aria-label="Luce degli effetti"
                    onChange={(event) =>
                      updateEffects({ lighting: event.target.value as LightingPresetId })
                    }
                  >
                    {LIGHTING_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="muted small">{preset.hint}</span>
                <label className="inline-select" title="Ombre del sole (di notte della luna)">
                  <span className="muted small">Ombre</span>
                  <select
                    value={effects.shadows}
                    aria-label="Ombre"
                    onChange={(event) =>
                      updateEffects({ shadows: event.target.value as ShadowMode })
                    }
                  >
                    {SHADOW_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline-select">
                  <span className="muted small">Vista</span>
                  <select
                    value={effects.view}
                    aria-label="Vista canale"
                    onChange={(event) => updateEffects({ view: Number(event.target.value) })}
                  >
                    {DEBUG_VIEWS.map((v, index) => (
                      <option key={v.label} value={index}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="muted small">{DEBUG_VIEWS[effects.view]?.hint}</span>
                <label className="preview-control">
                  <span>
                    Esposizione{' '}
                    <strong>
                      {effects.exposure > 0 ? '+' : ''}
                      {effects.exposure.toFixed(1)} EV
                    </strong>
                  </span>
                  <input
                    type="range"
                    min={-3}
                    max={3}
                    step={0.1}
                    value={effects.exposure}
                    aria-label="Esposizione"
                    onChange={(event) => updateEffects({ exposure: Number(event.target.value) })}
                  />
                </label>
                <label className="inline-select">
                  <span className="muted small">Tone mapping</span>
                  <select
                    value={effects.toneMapping}
                    aria-label="Tone mapping"
                    onChange={(event) =>
                      updateEffects({ toneMapping: event.target.value as ToneMappingId })
                    }
                  >
                    {TONE_MAPPINGS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="preview-control">
                  <span>
                    Bloom <strong>{effects.bloom > 0 ? effects.bloom.toFixed(2) : 'spento'}</strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={effects.bloom}
                    aria-label="Bloom"
                    onChange={(event) => updateEffects({ bloom: Number(event.target.value) })}
                  />
                </label>
                <label className="preview-control">
                  <span>
                    Forza emissione <strong>×{effects.emission.toFixed(1)}</strong>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={effects.emission}
                    aria-label="Forza emissione"
                    onChange={(event) => updateEffects({ emission: Number(event.target.value) })}
                  />
                </label>
                <button type="button" onClick={() => setEffects(DEFAULT_EFFECTS)}>
                  Ripristina effetti
                </button>
                <span className="muted small">
                  Anteprima approssimata: ogni shader pack interpreta LabPBR a modo suo.
                </span>
              </>
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}
