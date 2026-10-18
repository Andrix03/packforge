import { useState } from 'react'
import { hsvToRgb, rgbToHsv, sameColor, type Hsv, type UsedColor } from './color'
import { fromHex, toHex, TRANSPARENT, type Rgba } from './pixels'

type Slot = 'primary' | 'secondary'

interface ColorPanelProps {
  primary: Rgba
  secondary: Rgba
  onChange: (slot: Slot, color: Rgba) => void
  onSwap: () => void
  /** Colors recently painted with, newest first. */
  recent: readonly Rgba[]
  /** Colors used by the texture, darkest first. */
  palette: readonly UsedColor[]
}

/**
 * Primary/secondary swatches plus an HSV/alpha/hex/RGB editor for the selected one, recent colors
 * and the texture's own palette. Swatches: left click → primary, right click → secondary.
 */
export function ColorPanel(props: ColorPanelProps): React.JSX.Element {
  const [slot, setSlot] = useState<Slot>('primary')
  const color = slot === 'primary' ? props.primary : props.secondary
  const pick = (event: React.MouseEvent, value: Rgba): void => {
    event.preventDefault()
    props.onChange(event.button === 2 ? 'secondary' : 'primary', value)
  }

  return (
    <div className="color-panel">
      <div className="color-slots">
        <SlotButton
          label="Primario"
          hint="clic sinistro"
          color={props.primary}
          active={slot === 'primary'}
          onSelect={() => setSlot('primary')}
        />
        <SlotButton
          label="Secondario"
          hint="clic destro"
          color={props.secondary}
          active={slot === 'secondary'}
          onSelect={() => setSlot('secondary')}
        />
        <div className="row">
          <button type="button" onClick={props.onSwap} title="Scambia i colori (X)">
            ⇄ <kbd>X</kbd>
          </button>
          <button
            type="button"
            onClick={() => props.onChange(slot, TRANSPARENT)}
            title="Rende trasparente il colore selezionato: dipingendo, cancella"
            disabled={color[3] === 0}
          >
            Trasparente
          </button>
        </div>
      </div>

      <ColorEditor key={slot} color={color} onChange={(value) => props.onChange(slot, value)} />

      {props.recent.length > 0 && (
        <section>
          <h3 className="panel-title">Recenti</h3>
          <SwatchGrid colors={props.recent} onPick={pick} />
        </section>
      )}

      <section>
        <h3 className="panel-title">
          Colori della texture <span className="muted">({props.palette.length})</span>
        </h3>
        <SwatchGrid
          colors={props.palette.map((entry) => entry.color)}
          counts={props.palette.map((entry) => entry.count)}
          onPick={pick}
        />
      </section>
    </div>
  )
}

function SlotButton({
  label,
  hint,
  color,
  active,
  onSelect
}: {
  label: string
  hint: string
  color: Rgba
  active: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={active ? 'slot-button active' : 'slot-button'}
      aria-pressed={active}
      onClick={onSelect}
      title={`Modifica il colore ${label.toLowerCase()}`}
    >
      <Swatch color={color} />
      <span className="color-swatch-text">
        <span className="small">
          {label} <span className="muted">({hint})</span>
        </span>
        <span className="small muted">{describe(color)}</span>
      </span>
    </button>
  )
}

/** HSV + alpha sliders and hex/RGB fields; keeps the hue while saturation or value is zero. */
function ColorEditor({
  color,
  onChange
}: {
  color: Rgba
  onChange: (color: Rgba) => void
}): React.JSX.Element {
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(color))
  // Follow outside changes (picker, palette) but keep our hue when it still produces the color.
  const [syncedTo, setSyncedTo] = useState<Rgba>(color)
  if (!sameColor(syncedTo, color)) {
    setSyncedTo(color)
    if (!sameColor(hsvToRgb(hsv, color[3]), color)) setHsv(rgbToHsv(color))
  }
  const [hexDraft, setHexDraft] = useState<string | null>(null)

  const alpha = color[3]
  const updateHsv = (next: Hsv): void => {
    setHsv(next)
    // A transparent slot becomes opaque as soon as the user picks a color for it.
    const value = hsvToRgb(next, alpha === 0 ? 255 : alpha)
    setSyncedTo(value)
    onChange(value)
  }
  const setChannel = (index: number, value: number): void => {
    const next = [...color] as [number, number, number, number]
    next[index] = clampByte(value)
    if (index < 3 && next[3] === 0) next[3] = 255
    onChange(next)
  }
  const opaque: Rgba = [color[0], color[1], color[2], 255]

  return (
    <div className="color-editor">
      <Slider
        label="Tinta"
        value={Math.round(hsv.h)}
        max={360}
        background="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
        onChange={(h) => updateHsv({ ...hsv, h })}
      />
      <Slider
        label="Saturazione"
        value={Math.round(hsv.s * 100)}
        max={100}
        background={`linear-gradient(to right, ${css(hsvToRgb({ ...hsv, s: 0 }))}, ${css(hsvToRgb({ ...hsv, s: 1 }))})`}
        onChange={(s) => updateHsv({ ...hsv, s: s / 100 })}
      />
      <Slider
        label="Luminosità"
        value={Math.round(hsv.v * 100)}
        max={100}
        background={`linear-gradient(to right, #000, ${css(hsvToRgb({ ...hsv, v: 1 }))})`}
        onChange={(v) => updateHsv({ ...hsv, v: v / 100 })}
      />
      <Slider
        label="Opacità"
        value={alpha}
        max={255}
        background={`linear-gradient(to right, transparent, ${css(opaque)}), repeating-conic-gradient(#888 0% 25%, #666 0% 50%) 0 0 / 8px 8px`}
        onChange={(a) => setChannel(3, a)}
      />
      <div className="color-fields">
        <label title="Esadecimale: #rrggbb oppure #rrggbbaa">
          Hex
          <input
            value={hexDraft ?? toHexWithAlpha(color)}
            spellCheck={false}
            onChange={(event) => setHexDraft(event.target.value)}
            onBlur={() => {
              const parsed = hexDraft !== null ? fromHex(hexDraft) : null
              if (parsed) onChange(parsed)
              setHexDraft(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
              if (event.key === 'Escape') {
                setHexDraft(null)
                event.currentTarget.blur()
              }
            }}
          />
        </label>
        {(['R', 'G', 'B'] as const).map((name, index) => (
          <label key={name}>
            {name}
            <input
              type="number"
              min={0}
              max={255}
              value={color[index]}
              onChange={(event) => setChannel(index, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

function Slider({
  label,
  value,
  max,
  background,
  onChange
}: {
  label: string
  value: number
  max: number
  background: string
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <label className="color-slider">
      <span className="small muted">
        {label} <span className="slider-value">{value}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        style={{ background }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function SwatchGrid({
  colors,
  counts,
  onPick
}: {
  colors: readonly Rgba[]
  counts?: readonly number[]
  onPick: (event: React.MouseEvent, color: Rgba) => void
}): React.JSX.Element {
  return (
    <div className="swatch-grid">
      {colors.map((color, i) => (
        <button
          key={`${color.join(',')}`}
          type="button"
          className="swatch-cell"
          title={`${describe(color)}${counts ? ` · ${counts[i]} pixel` : ''} — sinistro: primario, destro: secondario`}
          onClick={(event) => onPick(event, color)}
          onContextMenu={(event) => onPick(event, color)}
        >
          <Swatch color={color} />
        </button>
      ))}
    </div>
  )
}

function Swatch({ color }: { color: Rgba }): React.JSX.Element {
  return (
    <span className="color-swatch checker">
      <span className="swatch-fill" style={{ background: css(color) }} />
    </span>
  )
}

function css([r, g, b, a]: Rgba): string {
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`
}

function toHexWithAlpha(color: Rgba): string {
  return color[3] === 255 ? toHex(color) : toHex(color) + color[3].toString(16).padStart(2, '0')
}

function describe(color: Rgba): string {
  if (color[3] === 0) return 'trasparente'
  return color[3] === 255 ? toHex(color) : `${toHex(color)} · opacità ${color[3]}`
}

function clampByte(value: number): number {
  return Number.isFinite(value) ? Math.min(255, Math.max(0, Math.round(value))) : 0
}
