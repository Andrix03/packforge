import type { Rgba } from './pixels'
import type { RampOptions } from './ramp'

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
}

/**
 * The shading ramp used by the shade and noise tools: a few shades of one color with hue shifting
 * (cool shadows, warm highlights). Swatches: left click → primary, right click → secondary.
 */
export function RampPanel(props: RampPanelProps): React.JSX.Element {
  const { options } = props
  const pick = (event: React.MouseEvent, color: Rgba): void => {
    event.preventDefault()
    props.onPick(event.button === 2 ? 'secondary' : 'primary', color)
  }
  return (
    <section className="ramp-panel">
      <h3 className="panel-title">
        Rampa <span className="muted">{props.locked ? '' : '(segue il primario)'}</span>
      </h3>
      <div className="ramp-swatches">
        {props.ramp.map((color) => (
          <button
            key={color.join(',')}
            type="button"
            className="ramp-swatch"
            style={{ background: `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})` }}
            title="Sinistro: primario, destro: secondario"
            onClick={(event) => pick(event, color)}
            onContextMenu={(event) => pick(event, color)}
          />
        ))}
      </div>
      <button
        type="button"
        className="small-button"
        onClick={props.onFromPrimary}
        title="Crea una nuova rampa partendo dal colore primario"
      >
        Nuova rampa dal primario
      </button>
      {props.pro && (
        <>
          <label
            className="color-slider"
            title="Quanto le ombre vanno verso il blu e le luci verso il giallo"
          >
            <span className="small muted">
              Spostamento tinta <span className="slider-value">{options.hueShift}°</span>
            </span>
            <input
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
            title="Differenza di luminosità tra due tonalità vicine. Le texture vanilla hanno poco contrasto."
          >
            <span className="small muted">
              Contrasto <span className="slider-value">{Math.round(options.contrast * 100)}%</span>
            </span>
            <input
              type="range"
              min={3}
              max={20}
              value={Math.round(options.contrast * 100)}
              onChange={(event) =>
                props.onOptions({ ...options, contrast: Number(event.target.value) / 100 })
              }
            />
          </label>
          <div className="tabs small-tabs" role="radiogroup" aria-label="Numero di tonalità">
            {[1, 2, 3].map((steps) => (
              <button
                key={steps}
                type="button"
                role="radio"
                aria-checked={options.steps === steps}
                className={options.steps === steps ? 'tab active' : 'tab'}
                onClick={() => props.onOptions({ ...options, steps })}
              >
                {steps * 2 + 1} tonalità
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
