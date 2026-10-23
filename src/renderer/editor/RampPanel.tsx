import { useState } from 'react'
import type { Rgba } from './pixels'
import type { RampOptions } from './ramp'
import { Glyph, RangeInput } from '../ui/components'
import { NAV_ICONS } from '../ui/icons'
import { tr } from '../../shared/i18n'

interface RampPanelProps {
  ramp: readonly Rgba[]
  options: RampOptions
  onOptions: (options: RampOptions) => void
  /** True once the ramp stopped following the primary color. */
  locked: boolean
  /** Rebuilds the ramp from the current primary color. */
  onFromPrimary: () => void
  onPick: (slot: 'primary' | 'secondary', color: Rgba) => void
  /** Pro mode shows hue shift, contrast and the number of shades. */
  pro: boolean
  /** True when the ramp was edited by hand (or taken from a palette). */
  custom: boolean
  /** Edit mode: left click replaces a shade with the primary color, right click removes it. */
  onEditShade: (index: number, action: 'replace' | 'remove') => void
  onAddShade: () => void
  onResetAuto: () => void
}

/**
 * The shading ramp used by the shade and noise tools: a few shades of one color with hue shifting
 * (cool shadows, warm highlights). Swatches: left click → primary, right click → secondary.
 */
export function RampPanel(props: RampPanelProps): React.JSX.Element {
  const { options } = props
  const [editing, setEditing] = useState(false)
  const pick = (event: React.MouseEvent, color: Rgba, index: number): void => {
    event.preventDefault()
    if (editing) props.onEditShade(index, event.button === 2 ? 'remove' : 'replace')
    else props.onPick(event.button === 2 ? 'secondary' : 'primary', color)
  }
  return (
    <section className="ramp-panel">
      <h3 className="panel-title">
        {tr('Rampa')}{' '}
        <span className="muted">
          {props.custom ? '(personalizzata)' : props.locked ? '' : tr('(segue il primario)')}
        </span>
      </h3>
      <div className={editing ? 'ramp-swatches editing' : 'ramp-swatches'}>
        {props.ramp.map((color, index) => (
          <button
            key={index}
            type="button"
            className="ramp-swatch"
            style={{ background: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})` }}
            title={
              editing
                ? tr('Sinistro: sostituisci con il colore primario. Destro: togli')
                : tr('Sinistro: primario, destro: secondario')
            }
            onClick={(event) => pick(event, color, index)}
            onContextMenu={(event) => pick(event, color, index)}
          />
        ))}
      </div>
      <button
        type="button"
        className="small-button"
        onClick={props.onFromPrimary}
        title={tr('Crea una nuova rampa partendo dal colore primario')}
      >
        {tr('Nuova rampa dal primario')}
      </button>
      {props.pro && (
        <div className="row ramp-edit">
          <button
            type="button"
            className="small-button"
            aria-pressed={editing}
            onClick={() => setEditing((e) => !e)}
            title={tr('Modifica le tonalità una per una')}
          >
            {editing ? (
              tr('Fine')
            ) : (
              <>
                <Glyph icon={NAV_ICONS.pencil} />
                {tr('Modifica')}
              </>
            )}
          </button>
          {editing && (
            <button
              type="button"
              className="small-button"
              onClick={props.onAddShade}
              title={tr('Aggiungi il colore primario alla rampa')}
            >
              {tr('+ Primario')}
            </button>
          )}
          {props.custom && (
            <button
              type="button"
              className="small-button"
              onClick={props.onResetAuto}
              title={tr('Torna alla rampa automatica con hue shifting')}
            >
              <Glyph name="reset" />
              {tr('Automatica')}
            </button>
          )}
        </div>
      )}
      {props.pro && !props.custom && (
        <>
          <label
            className="color-slider"
            title={tr('Quanto le ombre vanno verso il blu e le luci verso il giallo')}
          >
            <span className="small muted">
              {tr('Spostamento tinta')} <span className="slider-value">{options.hueShift}°</span>
            </span>
            <RangeInput
              type="range"
              min={0}
              max={30}
              value={options.hueShift}
              onChange={(event) =>
                props.onOptions({ ...options, hueShift: Number(event.target.value) })
              }
            />
          </label>
          <label
            className="color-slider"
            title={tr(
              'Differenza di luminosità tra due tonalità vicine. Le texture vanilla hanno poco contrasto.'
            )}
          >
            <span className="small muted">
              {tr('Contrasto')}{' '}
              <span className="slider-value">{Math.round(options.contrast * 100)}%</span>
            </span>
            <RangeInput
              type="range"
              min={3}
              max={20}
              value={Math.round(options.contrast * 100)}
              onChange={(event) =>
                props.onOptions({ ...options, contrast: Number(event.target.value) / 100 })
              }
            />
          </label>
          <div className="tabs small-tabs" role="radiogroup" aria-label={tr('Numero di tonalità')}>
            {[1, 2, 3].map((steps) => (
              <button
                key={steps}
                type="button"
                role="radio"
                aria-checked={options.steps === steps}
                className={options.steps === steps ? 'tab active' : 'tab'}
                onClick={() => props.onOptions({ ...options, steps })}
              >
                {tr('{0} tonalità', steps * 2 + 1)}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
