// The editor's preview for GUI textures (in place of the 3D block): the texture at GUI scale 1–4
// as the game draws it, and for sprites their `gui.scaling` (stretch, tile, nine-slice) with the
// sizes the game stretches them to, plus an editor for that section of the .png.mcmeta.
import { useEffect, useRef, useState } from 'react'
import { tr } from '../../shared/i18n'
import {
  guiTextureKind,
  layoutSprite,
  logicalSize,
  parseGuiScaling,
  withGuiScaling,
  type Border,
  type GuiScaling,
  type SpritePiece
} from '../../shared/guiScaling'
import { assetUrl } from '../../shared/ipc'
import { Glyph, OreButton, Switch } from '../ui/components'
import type { AssetSources } from './modelSource'

interface Props {
  /** Pack path of the texture, e.g. `assets/minecraft/textures/gui/sprites/widget/button.png`. */
  path: string
  /** The pixels being painted (refreshed on `revision`). */
  canvas: HTMLCanvasElement | null
  revision: number
  /** The texture's own .png.mcmeta in the pack (null when it has none). */
  mcmeta: unknown
  sources: AssetSources
  readOnly: boolean
  /** Writes the .png.mcmeta (null deletes it); true when saved. */
  onSaveMcmeta: (content: string | null) => Promise<boolean>
}

interface VanillaInfo {
  width: number
  height: number
  scaling: GuiScaling | null
}

const SCALES = [1, 2, 3, 4] as const

export function GuiPreview(props: Props): React.JSX.Element {
  const kind = guiTextureKind(props.path)
  const parsed = parseGuiScaling(props.mcmeta)
  const packScaling = parsed.ok ? parsed.scaling : null
  const hasOwnSection = hasGuiSection(props.mcmeta)
  // null = the largest GUI scale at which the widest preview still fits the column.
  const [chosenScale, setScale] = useState<number | null>(null)
  const [draft, setDraft] = useState<GuiScaling | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const vanilla = useVanillaInfo(props.sources, props.path)

  const pixels = { width: props.canvas?.width ?? 0, height: props.canvas?.height ?? 0 }
  // What the preview shows: the scaling being edited, else the pack's, else stretch.
  const shown: GuiScaling = draft ?? packScaling ?? { type: 'stretch' }
  const logical = logicalSize(
    shown,
    pixels,
    vanilla ? { width: vanilla.width, height: vanilla.height } : null
  )
  const sizes = sizesFor(shown, logical)
  const scale = chosenScale ?? fitScale(sizes)
  const check = draft ? parseGuiScaling(JSON.parse(withGuiScaling(null, draft) ?? '{}')) : null
  const draftError = check && !check.ok ? check.error : null
  // The game reads the scaling from the pack that gives the image: the vanilla one doesn't carry over.
  const lostScaling =
    kind === 'sprite' && !hasOwnSection && vanilla?.scaling && vanilla.scaling.type !== 'stretch'
      ? vanilla.scaling
      : null

  async function save(next: GuiScaling | null): Promise<void> {
    setSaving(true)
    setError(null)
    const ok = await props.onSaveMcmeta(withGuiScaling(props.mcmeta, next))
    setSaving(false)
    if (ok) setDraft(null)
    else setError(tr('Impossibile salvare il .png.mcmeta.'))
  }

  return (
    <section className="gui-preview card" aria-label={tr('Anteprima GUI')}>
      <div className="gui-preview-head">
        <span className="lbl">{tr('Anteprima GUI')}</span>
        <div className="row" role="radiogroup" aria-label={tr('Scala GUI')}>
          {SCALES.map((s) => (
            <OreButton
              key={s}
              role="radio"
              aria-checked={scale === s}
              on={scale === s}
              onClick={() => setScale(s)}
            >
              {s}×
            </OreButton>
          ))}
        </div>
      </div>
      <p className="muted small">
        {tr(
          '{0}×{1} unità GUI, {2}×{3} pixel.',
          logical.width,
          logical.height,
          pixels.width,
          pixels.height
        )}
      </p>

      <div className="gui-stage sunken">
        {sizes.map((size, i) => (
          <SpriteView
            key={`${i}-${size.width}x${size.height}`}
            canvas={props.canvas}
            revision={props.revision}
            scaling={shown}
            logical={logical}
            width={size.width}
            height={size.height}
            scale={scale}
            borders={i === 0 && shown.type === 'nine_slice' ? shown.border : null}
          />
        ))}
      </div>
      {shown.type === 'stretch' && kind === 'sprite' && (
        <p className="muted small">
          {tr('Stirato: il gioco lo allunga alla misura che gli serve, pixel compresi.')}
        </p>
      )}

      {lostScaling && (
        <p className="gui-warning small" role="alert">
          <Glyph name="warning" />
          {tr(
            'In vanilla questo sprite è {0}, ma la scala si legge dal .png.mcmeta del pack che dà l’immagine: senza il tuo, il gioco lo stira.',
            scalingName(lostScaling)
          )}
        </p>
      )}

      {kind === 'sprite' && !props.readOnly && (
        <ScalingEditor
          value={shown}
          logical={logical}
          vanilla={vanilla?.scaling ?? null}
          dirty={draft !== null}
          saving={saving}
          error={draftError ?? error ?? (parsed.ok ? null : parsed.error)}
          onChange={setDraft}
          onSave={() => void save(draft ?? shown)}
          onUseVanilla={() => vanilla?.scaling && setDraft(vanilla.scaling)}
          onReset={() => setDraft(null)}
        />
      )}
    </section>
  )
}

/** The sizes shown: the sprite itself, then wider and larger when the scaling repeats or slices. */
function sizesFor(scaling: GuiScaling, logical: { width: number; height: number }) {
  const sizes = [logical]
  if (scaling.type === 'stretch') return sizes
  if (logical.width >= 64) {
    // Wide sprites (buttons, bars) are drawn narrower and wider than they are, never taller.
    sizes.push({ width: Math.round(logical.width * 0.5), height: logical.height })
    sizes.push({ width: Math.round(logical.width * 1.5), height: logical.height })
  } else {
    sizes.push({ width: Math.round(logical.width * 2.5), height: logical.height })
    sizes.push({ width: logical.width * 2, height: logical.height * 2 })
  }
  return sizes
}

/** Width the side column gives the preview, in CSS pixels (a little less than the panel). */
const STAGE_WIDTH = 250

function fitScale(sizes: Array<{ width: number }>): number {
  const widest = Math.max(...sizes.map((s) => s.width), 1)
  return Math.max(1, Math.min(4, Math.floor(STAGE_WIDTH / widest)))
}

function SpriteView(props: {
  canvas: HTMLCanvasElement | null
  revision: number
  scaling: GuiScaling
  logical: { width: number; height: number }
  width: number
  height: number
  scale: number
  borders: Border | null
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const { canvas, revision, scaling, logical, width, height, scale, borders } = props
  useEffect(() => {
    const target = ref.current
    if (!target || !canvas || canvas.width === 0) return
    const ctx = target.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, target.width, target.height)
    // Pixels per GUI unit of the source (a 2× pack has 2).
    const px = canvas.width / logical.width
    const pieces = layoutSprite(scaling, width, height, logical.width, logical.height)
    for (const piece of pieces) drawPiece(ctx, canvas, piece, px, scale)
    if (borders) {
      ctx.fillStyle = 'rgba(232, 120, 74, 0.9)'
      const s = scale
      ctx.fillRect(borders.left * s, 0, 1, height * s)
      ctx.fillRect((width - borders.right) * s, 0, 1, height * s)
      ctx.fillRect(0, borders.top * s, width * s, 1)
      ctx.fillRect(0, (height - borders.bottom) * s, width * s, 1)
    }
  }, [canvas, revision, scaling, logical, width, height, scale, borders])
  return (
    <canvas
      ref={ref}
      className="gui-sprite"
      width={Math.max(1, width * scale)}
      height={Math.max(1, height * scale)}
      title={`${width}×${height}`}
    />
  )
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  piece: SpritePiece,
  px: number,
  scale: number
): void {
  const { source: s, target: t } = piece
  if (piece.fill === 'stretch') {
    ctx.drawImage(
      image,
      s.x * px,
      s.y * px,
      s.width * px,
      s.height * px,
      t.x * scale,
      t.y * scale,
      t.width * scale,
      t.height * scale
    )
    return
  }
  // Tiled: repeat the source from the top-left corner, the last copies cut at the edge.
  for (let y = 0; y < t.height; y += s.height) {
    for (let x = 0; x < t.width; x += s.width) {
      const w = Math.min(s.width, t.width - x)
      const h = Math.min(s.height, t.height - y)
      ctx.drawImage(
        image,
        s.x * px,
        s.y * px,
        w * px,
        h * px,
        (t.x + x) * scale,
        (t.y + y) * scale,
        w * scale,
        h * scale
      )
    }
  }
}

function ScalingEditor(props: {
  value: GuiScaling
  logical: { width: number; height: number }
  vanilla: GuiScaling | null
  dirty: boolean
  saving: boolean
  error: string | null
  onChange: (next: GuiScaling) => void
  onSave: () => void
  onUseVanilla: () => void
  onReset: () => void
}): React.JSX.Element {
  const { value, logical } = props
  const types: Array<[GuiScaling['type'], string, string]> = [
    ['stretch', tr('Stirato'), tr('Tutto lo sprite allungato alla misura richiesta')],
    ['tile', tr('Ripetuto'), tr('Lo sprite ripetuto per riempire la misura richiesta')],
    [
      'nine_slice',
      tr('Nine-slice'),
      tr('Angoli fissi, bordi e centro che si allungano o si ripetono')
    ]
  ]
  const toType = (type: GuiScaling['type']): GuiScaling => {
    if (type === 'stretch') return { type }
    if (type === 'tile') return { type, width: logical.width, height: logical.height }
    const border =
      value.type === 'nine_slice' ? value.border : { left: 3, top: 3, right: 3, bottom: 3 }
    return { type, width: logical.width, height: logical.height, border, stretchInner: false }
  }
  const setBorder = (side: keyof Border, n: number): void => {
    if (value.type !== 'nine_slice') return
    props.onChange({ ...value, border: { ...value.border, [side]: Math.max(0, Math.round(n)) } })
  }
  const sides: Array<[keyof Border, string]> = [
    ['left', tr('Sinistra')],
    ['top', tr('Sopra')],
    ['right', tr('Destra')],
    ['bottom', tr('Sotto')]
  ]
  return (
    <div className="gui-scaling">
      <span className="lbl">{tr('Scala dello sprite (gui.scaling)')}</span>
      <div className="row" role="radiogroup" aria-label={tr('Tipo di scala')}>
        {types.map(([type, label, title]) => (
          <OreButton
            key={type}
            role="radio"
            aria-checked={value.type === type}
            on={value.type === type}
            title={title}
            onClick={() => value.type !== type && props.onChange(toType(type))}
          >
            {label}
          </OreButton>
        ))}
      </div>
      {value.type === 'nine_slice' && (
        <>
          <div className="gui-borders">
            {sides.map(([side, label]) => (
              <label key={side} className="gui-border">
                <span className="small">{label}</span>
                <input
                  type="number"
                  min={0}
                  max={side === 'left' || side === 'right' ? value.width : value.height}
                  value={value.border[side]}
                  aria-label={tr('Bordo {0}', label)}
                  onChange={(event) => setBorder(side, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
          <div className="row">
            <Switch
              checked={value.stretchInner}
              label={tr('Centro allungato invece che ripetuto')}
              onChange={(stretchInner) => props.onChange({ ...value, stretchInner })}
            />
            <span className="small">{tr('Centro allungato invece che ripetuto')}</span>
          </div>
          <p className="muted small">
            {tr('Le linee arancioni sul primo sprite sono i bordi: gli angoli restano fissi.')}
          </p>
        </>
      )}
      {props.error && <p className="field-error small">{props.error}</p>}
      <div className="row wrap">
        <button
          type="button"
          className="primary"
          disabled={props.saving || !props.dirty || props.error !== null}
          onClick={props.onSave}
        >
          {props.saving ? tr('Salvataggio…') : tr('Salva la scala')}
        </button>
        {props.vanilla && props.vanilla.type !== 'stretch' && (
          <button type="button" className="small-button" onClick={props.onUseVanilla}>
            {tr('Usa la scala di vanilla')}
          </button>
        )}
        {props.dirty && (
          <button type="button" className="small-button" onClick={props.onReset}>
            {tr('Annulla')}
          </button>
        )}
      </div>
    </div>
  )
}

/** Size and scaling of the vanilla sprite, for the logical size and the "lost scaling" warning. */
function useVanillaInfo(sources: AssetSources, path: string): VanillaInfo | null {
  const [info, setInfo] = useState<{ path: string; value: VanillaInfo } | null>(null)
  useEffect(() => {
    const vanilla = sources.vanilla
    if (!vanilla?.files.has(path)) return
    let cancelled = false
    void (async () => {
      const image = new Image()
      image.src = assetUrl(vanilla.base, path)
      await image.decode().catch(() => undefined)
      let scaling: GuiScaling | null = null
      if (vanilla.files.has(`${path}.mcmeta`)) {
        const json: unknown = await fetch(assetUrl(vanilla.base, `${path}.mcmeta`))
          .then((r) => r.json())
          .catch(() => null)
        const parsed = parseGuiScaling(json)
        if (parsed.ok) scaling = parsed.scaling
      }
      if (!cancelled && image.naturalWidth > 0) {
        setInfo({
          path,
          value: { width: image.naturalWidth, height: image.naturalHeight, scaling }
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sources.vanilla, path])
  return info?.path === path ? info.value : null
}

function hasGuiSection(mcmeta: unknown): boolean {
  return (
    typeof mcmeta === 'object' &&
    mcmeta !== null &&
    typeof (mcmeta as Record<string, unknown>)['gui'] === 'object'
  )
}

function scalingName(scaling: GuiScaling): string {
  return scaling.type === 'nine_slice'
    ? tr('nine-slice')
    : scaling.type === 'tile'
      ? tr('ripetuto')
      : tr('stirato')
}
