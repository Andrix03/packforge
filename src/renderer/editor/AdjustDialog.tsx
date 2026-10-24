import { useEffect, useRef, useState } from 'react'
import {
  NEUTRAL_ADJUSTMENTS,
  adjustPixels,
  isNeutralAdjustments,
  type Adjustments
} from '../../shared/adjust'
import { tr } from '../../shared/i18n'
import { useEscape } from '../useEscape'
import { Glyph, RangeInput } from '../ui/components'
import type { PixelBuffer } from './pixels'

type Field = {
  label: () => string
  min: number
  max: number
  step: number
  get: (a: Adjustments) => number
  set: (a: Adjustments, v: number) => Adjustments
  show: (v: number) => string
}

const FIELDS: Field[] = [
  {
    label: () => tr('Tinta'),
    min: -180,
    max: 180,
    step: 1,
    get: (a) => a.hue,
    set: (a, v) => ({ ...a, hue: v }),
    show: (v) => `${v}°`
  },
  {
    label: () => tr('Saturazione'),
    min: 0,
    max: 2,
    step: 0.05,
    get: (a) => a.saturation,
    set: (a, v) => ({ ...a, saturation: v }),
    show: (v) => `${Math.round(v * 100)}%`
  },
  {
    label: () => tr('Luminosità'),
    min: -0.5,
    max: 0.5,
    step: 0.01,
    get: (a) => a.lightness,
    set: (a, v) => ({ ...a, lightness: v }),
    show: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`
  },
  {
    label: () => tr('Contrasto'),
    min: 0.5,
    max: 1.5,
    step: 0.05,
    get: (a) => a.contrast,
    set: (a, v) => ({ ...a, contrast: v }),
    show: (v) => `${Math.round(v * 100)}%`
  },
  {
    label: () => tr('Livelli: nero'),
    min: 0,
    max: 254,
    step: 1,
    get: (a) => a.levels.black,
    set: (a, v) => ({ ...a, levels: { ...a.levels, black: Math.min(v, a.levels.white - 1) } }),
    show: (v) => String(v)
  },
  {
    label: () => tr('Livelli: bianco'),
    min: 1,
    max: 255,
    step: 1,
    get: (a) => a.levels.white,
    set: (a, v) => ({ ...a, levels: { ...a.levels, white: Math.max(v, a.levels.black + 1) } }),
    show: (v) => String(v)
  },
  {
    label: () => tr('Livelli: toni medi'),
    min: 0.3,
    max: 3,
    step: 0.05,
    get: (a) => a.levels.gamma,
    set: (a, v) => ({ ...a, levels: { ...a.levels, gamma: v } }),
    show: (v) => v.toFixed(2)
  }
]

function Preview({
  data,
  width,
  height
}: {
  data: Uint8ClampedArray
  width: number
  height: number
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.width = width
    canvas.height = height
    context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0)
  }, [data, width, height])
  return <canvas ref={ref} className="adjust-preview sunken" aria-hidden="true" />
}

/**
 * Colour adjustments of the open texture (or of the selection): hue, saturation, lightness,
 * contrast (OKLab, as the GUI recolour) and levels; previewed before/after, applied as one undo
 * step. Alpha is never changed.
 */
export function AdjustDialog({
  pixels,
  mask,
  onApply,
  onClose
}: {
  /** The layer being painted (copied for the preview). */
  pixels: PixelBuffer
  /** The selection: only its pixels change (null = all). */
  mask: Uint8Array | null
  onApply: (adjustments: Adjustments) => void
  onClose: () => void
}): React.JSX.Element {
  const [adjustments, setAdjustments] = useState<Adjustments>(NEUTRAL_ADJUSTMENTS)
  const [before] = useState(() => new Uint8ClampedArray(pixels.data))
  useEscape(onClose)
  const after = adjustPixels(before, adjustments, mask)
  const neutral = isNeutralAdjustments(adjustments)
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form adjust-dialog"
        role="dialog"
        aria-label={tr('Regola colori')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph name="gear" />
          {tr('Regola colori')}
        </h2>
        <p className="muted small">
          {mask
            ? tr('Solo i pixel selezionati. La trasparenza non cambia.')
            : tr('Tutta la texture. La trasparenza non cambia.')}
        </p>
        <div className="adjust-previews">
          <figure>
            <Preview data={before} width={pixels.width} height={pixels.height} />
            <figcaption className="muted small">{tr('Prima')}</figcaption>
          </figure>
          <figure>
            <Preview data={after} width={pixels.width} height={pixels.height} />
            <figcaption className="muted small">{tr('Dopo')}</figcaption>
          </figure>
        </div>
        {FIELDS.map((field) => {
          const value = field.get(adjustments)
          return (
            <label key={field.label()} className="item-number small">
              <span>
                {field.label()} <b>{field.show(value)}</b>
              </span>
              <RangeInput
                min={field.min}
                max={field.max}
                step={field.step}
                value={value}
                aria-label={field.label()}
                onChange={(event) =>
                  setAdjustments(field.set(adjustments, Number(event.target.value)))
                }
              />
            </label>
          )
        })}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={neutral}
            onClick={() => onApply(adjustments)}
          >
            {tr('Applica')}
          </button>
          <button
            type="button"
            disabled={neutral}
            onClick={() => setAdjustments(NEUTRAL_ADJUSTMENTS)}
          >
            {tr('Azzera')}
          </button>
          <button type="button" onClick={onClose}>
            {tr('Annulla')}
          </button>
        </div>
      </div>
    </div>
  )
}
