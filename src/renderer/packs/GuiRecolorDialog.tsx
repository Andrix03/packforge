// "Recolour GUI": the pack's own GUI textures recoloured in one go (dark mode, warmer, cooler,
// grey, or by hand), with before/after and a backup first. Vanilla textures are never touched:
// only what is already in the pack.
import { useEffect, useMemo, useRef, useState } from 'react'
import { tr } from '../../shared/i18n'
import {
  isNeutral,
  NEUTRAL,
  packGuiTextures,
  packTextureAreas,
  packTexturesIn,
  RECOLOR_PRESETS,
  recolorPixels,
  type RecolorPreset,
  type RecolorSettings
} from '../../shared/guiRecolor'
import type { DecodedPng } from '../../shared/pngCodec'
import { Glyph, OreButton, ProgressBar, RangeInput } from '../ui/components'
import { useEscape } from '../useEscape'
import { backupBefore } from './backup'
import { errorMessage, loadPng, type FileSource } from './packFetch'

const PRESET_NAMES: Record<RecolorPreset, string> = {
  dark: tr('Scuro'),
  warm: tr('Caldo'),
  cool: tr('Freddo'),
  grey: tr('Grigio')
}

type Phase =
  | { status: 'setup' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; written: number; errors: string[] }

export function GuiRecolorDialog({
  pack,
  anyArea = false,
  onClose
}: {
  pack: FileSource
  /** Opened from the pack tools: any texture folder of the pack can be chosen (GUI otherwise). */
  anyArea?: boolean
  onClose: () => void
}): React.JSX.Element {
  const areas = useMemo(() => packTextureAreas(pack.files), [pack.files])
  // '' = every texture of the pack.
  const [area, setArea] = useState<string>(anyArea ? (areas[0]?.area ?? 'block') : 'gui')
  const gui = area === 'gui'
  const textures = useMemo(
    () =>
      gui ? packGuiTextures(pack.files) : packTexturesIn(pack.files, area === '' ? null : area),
    [pack.files, gui, area]
  )
  // The unticked textures: every area starts with all of its textures ticked.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const selected = new Set(textures.filter((t) => !excluded.has(t)))
  const setSelected = (next: ReadonlySet<string>): void =>
    setExcluded(
      new Set([
        ...[...excluded].filter((t) => !textures.includes(t)),
        ...textures.filter((t) => !next.has(t))
      ])
    )
  const [settings, setSettings] = useState<RecolorSettings>(RECOLOR_PRESETS.dark)
  const [phase, setPhase] = useState<Phase>({ status: 'setup' })
  useEscape(onClose, phase.status !== 'running')
  const chosen = textures.filter((t) => selected.has(t))
  const sample = chosen.slice(0, 3)
  const set = (patch: Partial<RecolorSettings>): void => setSettings({ ...settings, ...patch })

  async function apply(): Promise<void> {
    if (
      !(await backupBefore(
        gui ? tr('Ricolora GUI ({0})', chosen.length) : tr('Ricolora texture ({0})', chosen.length),
        chosen
      ))
    )
      return
    const errors: string[] = []
    let written = 0
    for (let i = 0; i < chosen.length; i++) {
      const path = chosen[i] ?? ''
      setPhase({ status: 'running', done: i, total: chosen.length })
      try {
        const image = await loadPng(pack, path)
        const rgba = recolorPixels(image.data, settings)
        const result = await window.api.invoke(
          'texture:save',
          path,
          image.width,
          image.height,
          new Uint8Array(rgba.buffer)
        )
        if (result.ok) written++
        else errors.push(`${path.split('/').pop()}: ${result.error}`)
      } catch (error) {
        errors.push(`${path.split('/').pop()}: ${errorMessage(error)}`)
      }
    }
    setPhase({ status: 'done', written, errors })
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => phase.status !== 'running' && onClose()}
    >
      <div
        className="card modal gui-recolor"
        role="dialog"
        aria-label={gui ? tr('Ricolora GUI') : tr('Ricolora texture')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{gui ? tr('Ricolora GUI') : tr('Ricolora texture')}</h2>
        <p className="muted small">
          {gui
            ? tr(
                'Cambia insieme i colori delle texture GUI del tuo pack: le trasparenze restano, le sfumature si spostano tutte nello stesso modo. Le texture vanilla non si toccano.'
              )
            : tr(
                'Cambia insieme i colori di tante texture del tuo pack: le trasparenze restano, le sfumature si spostano tutte nello stesso modo. Le mappe _n / _s e le texture vanilla non si toccano.'
              )}
        </p>
        {anyArea && (
          <label className="small select-field">
            {tr('Quali texture')}{' '}
            <select
              value={area}
              aria-label={tr('Quali texture')}
              onChange={(event) => setArea(event.target.value)}
            >
              {areas.map(({ area: a, count }) => (
                <option key={a} value={a}>
                  {a} ({count})
                </option>
              ))}
              <option value="">
                {tr(
                  'Tutte ({0})',
                  areas.reduce((sum, a) => sum + a.count, 0)
                )}
              </option>
            </select>
          </label>
        )}
        {textures.length === 0 ? (
          <p className="small">
            {gui
              ? tr('Il pack non ha ancora texture GUI: creale dalla scheda GUI, poi torna qui.')
              : tr('Nessuna texture del pack in questa cartella.')}
          </p>
        ) : (
          <>
            <div className="row wrap" role="radiogroup" aria-label={tr('Preimpostazioni')}>
              {(Object.keys(RECOLOR_PRESETS) as RecolorPreset[]).map((preset) => {
                const on = JSON.stringify(settings) === JSON.stringify(RECOLOR_PRESETS[preset])
                return (
                  <OreButton
                    key={preset}
                    role="radio"
                    aria-checked={on}
                    on={on}
                    onClick={() => setSettings(RECOLOR_PRESETS[preset])}
                  >
                    {PRESET_NAMES[preset]}
                  </OreButton>
                )
              })}
              <OreButton
                role="radio"
                aria-checked={isNeutral(settings)}
                on={isNeutral(settings)}
                onClick={() => setSettings(NEUTRAL)}
              >
                {tr('Nessuna modifica')}
              </OreButton>
            </div>
            <div className="gui-recolor-sliders">
              <Slider
                label={tr('Tinta')}
                value={settings.hue}
                min={-180}
                max={180}
                step={5}
                unit="°"
                onChange={(hue) => set({ hue })}
              />
              <Slider
                label={tr('Saturazione')}
                value={Math.round(settings.saturation * 100)}
                min={0}
                max={200}
                step={5}
                unit="%"
                onChange={(v) => set({ saturation: v / 100 })}
              />
              <Slider
                label={tr('Luminosità')}
                value={Math.round(settings.lightness * 100)}
                min={-60}
                max={60}
                step={2}
                unit=""
                onChange={(v) => set({ lightness: v / 100 })}
              />
              <Slider
                label={tr('Contrasto')}
                value={Math.round(settings.contrast * 100)}
                min={40}
                max={160}
                step={5}
                unit="%"
                onChange={(v) => set({ contrast: v / 100 })}
              />
            </div>
            <div className="gui-recolor-preview">
              {sample.map((path) => (
                <BeforeAfter key={path} pack={pack} path={path} settings={settings} />
              ))}
            </div>
            <ul
              className="batch-list gui-recolor-list"
              aria-label={gui ? tr('Texture GUI del pack') : tr('Texture del pack')}
            >
              {textures.map((path) => (
                <li key={path}>
                  <label className="batch-row">
                    <input
                      type="checkbox"
                      checked={selected.has(path)}
                      onChange={(event) => {
                        const next = new Set(selected)
                        if (event.target.checked) next.add(path)
                        else next.delete(path)
                        setSelected(next)
                      }}
                    />
                    <span className="small">{path.replace(/^assets\/[^/]+\/textures\//, '')}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        {phase.status === 'running' && (
          <ProgressBar label={tr('Ricoloro le texture')} done={phase.done} total={phase.total} />
        )}
        {phase.status === 'done' && (
          <p className="small" data-testid="recolor-result">
            <Glyph name="check" />
            {tr('{0} texture ricolorate. Il backup è in Pack › Backup.', phase.written)}
            {phase.errors.map((e) => (
              <span key={e} className="field-error small">
                <br />
                {e}
              </span>
            ))}
          </p>
        )}
        <div className="row">
          {phase.status !== 'done' && textures.length > 0 && (
            <button
              type="button"
              className="primary"
              disabled={phase.status === 'running' || chosen.length === 0 || isNeutral(settings)}
              onClick={() => void apply()}
            >
              {tr('Ricolora {0}', chosen.length)}
            </button>
          )}
          <button type="button" disabled={phase.status === 'running'} onClick={onClose}>
            {phase.status === 'done' ? tr('Chiudi') : tr('Annulla')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <label className="color-slider">
      <span className="small muted">
        {props.label}{' '}
        <span className="slider-value">
          {props.value > 0 && props.min < 0 ? '+' : ''}
          {props.value}
          {props.unit}
        </span>
      </span>
      <RangeInput
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        aria-label={props.label}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  )
}

/** One texture before and after, side by side. */
function BeforeAfter({
  pack,
  path,
  settings
}: {
  pack: FileSource
  path: string
  settings: RecolorSettings
}) {
  const [image, setImage] = useState<{ path: string; png: DecodedPng } | null>(null)
  const before = useRef<HTMLCanvasElement>(null)
  const after = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    void loadPng(pack, path)
      .then((png) => !cancelled && setImage({ path, png }))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [pack, path])
  const png = image?.path === path ? image.png : null
  useEffect(() => {
    if (!png) return
    const draw = (canvas: HTMLCanvasElement | null, data: Uint8ClampedArray | Uint8Array): void => {
      const ctx = canvas?.getContext('2d')
      if (!ctx) return
      ctx.putImageData(new ImageData(new Uint8ClampedArray(data), png.width, png.height), 0, 0)
    }
    draw(before.current, png.data)
    draw(after.current, recolorPixels(png.data, settings))
  }, [png, settings])
  return (
    <figure className="gui-recolor-pair">
      <div className="row">
        <canvas
          ref={before}
          className="gui-sprite checker"
          width={png?.width ?? 1}
          height={png?.height ?? 1}
        />
        <canvas
          ref={after}
          className="gui-sprite checker"
          width={png?.width ?? 1}
          height={png?.height ?? 1}
        />
      </div>
      <figcaption className="muted small">{path.split('/').pop()}</figcaption>
    </figure>
  )
}
