import type { MapKind } from '../../shared/labpbr'
import { channelsOf, type ChannelDef, type ChannelId } from './channels'
import { Glyph, RangeInput } from '../ui/components'
import { NAV_ICONS } from '../ui/icons'
import { tr } from '../../shared/i18n'

export type Surface = 'color' | MapKind

export interface MapTabInfo {
  kind: MapKind
  /** null = the map can't be edited (unreadable file). */
  error: string | null
  existed: boolean
  dirty: boolean
}

const SURFACE_LABELS: Record<MapKind, { label: string; title: string }> = {
  normal: {
    label: tr('Rilievo _n'),
    title: tr('Altezza (POM), occlusione e normali: il file _n.png accanto alla texture')
  },
  specular: {
    label: tr('Materiale _s'),
    title: tr('Levigatezza, riflettanza/metalli, porosità ed emissione: il file _s.png')
  }
}

/**
 * The editor's tabs (v3): what is being painted, the color texture or one channel of its LabPBR
 * maps, and Prova, the texture in a small world.
 */
export function MapTabs({
  surface,
  channel,
  maps,
  onSurface,
  onChannel,
  onTest
}: {
  surface: Surface
  channel: ChannelId | null
  maps: readonly MapTabInfo[]
  onSurface: (surface: Surface) => void
  onChannel: (channel: ChannelId) => void
  /** Opens the test screen; null hides the tab (nothing loaded yet). */
  onTest?: (() => void) | null | undefined
}): React.JSX.Element {
  return (
    <div className="map-tabs">
      <div className="face-tabs" role="tablist" aria-label={tr('Cosa dipingi')}>
        <span className="muted small">{tr('Dipingi:')}</span>
        <button
          type="button"
          role="tab"
          aria-selected={surface === 'color'}
          className={surface === 'color' ? 'tab active' : 'tab'}
          title={tr('I colori della texture')}
          onClick={() => onSurface('color')}
        >
          {tr('Colore')}
        </button>
        {maps.map((map) => {
          const { label, title } = SURFACE_LABELS[map.kind]
          const status = map.error
            ? tr(' — non leggibile: {0}', map.error)
            : map.existed
              ? ''
              : tr(' — non esiste ancora: si crea al salvataggio, se la dipingi')
          return (
            <button
              key={map.kind}
              type="button"
              role="tab"
              aria-selected={surface === map.kind}
              className={surface === map.kind ? 'tab active' : map.existed ? 'tab' : 'tab missing'}
              title={title + status}
              disabled={map.error !== null}
              onClick={() => onSurface(map.kind)}
            >
              {map.existed ? label : `+ ${label}`}
              {map.dirty && <Glyph name="dot" alone />}
            </button>
          )
        })}
        {onTest && (
          <button
            type="button"
            className="tab test-tab"
            title={tr(
              'Guarda la texture come apparirà nel gioco: scene, distanza, confronto con vanilla'
            )}
            onClick={onTest}
          >
            <Glyph icon={NAV_ICONS.cube} />
            {tr('Prova')}
          </button>
        )}
      </div>
      {surface !== 'color' && (
        <div className="face-tabs channel-tabs" role="tablist" aria-label={tr('Canale')}>
          <span className="muted small">{tr('Canale:')}</span>
          {channelsOf(surface).map((def) => (
            <button
              key={def.id}
              type="button"
              role="tab"
              aria-selected={channel === def.id}
              className={channel === def.id ? 'tab active' : 'tab'}
              title={def.hint}
              onClick={() => onChannel(def.id)}
            >
              {def.label} <span className="muted">{def.letter}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export interface ChannelValues {
  primary: number
  secondary: number
}

/** Value picker of a map channel (replaces the color panel): gray 0–max plus named presets. */
export function ValuePanel({
  channel,
  values,
  onValues,
  rampStep,
  onRampStep,
  overlay,
  onOverlay,
  readOnly
}: {
  channel: ChannelDef
  values: ChannelValues
  onValues: (values: ChannelValues) => void
  /** Gray step between the shades used by the shade and noise tools. */
  rampStep: number
  onRampStep: (step: number) => void
  /** Opacity (0–100) of the color texture drawn over the channel, to find your way around. */
  overlay: number
  onOverlay: (value: number) => void
  readOnly: boolean
}): React.JSX.Element {
  const set = (slot: keyof ChannelValues, value: number): void =>
    onValues({ ...values, [slot]: Math.max(0, Math.min(channel.max, Math.round(value))) })
  const pick = (event: React.MouseEvent, value: number): void => {
    event.preventDefault()
    set(event.button === 2 ? 'secondary' : 'primary', value)
  }
  return (
    <div className="color-panel value-panel">
      <h3 className="panel-title">
        {channel.label} <span className="muted">({channel.letter})</span>
      </h3>
      <p className="small muted">{channel.hint}</p>
      {channel.paintable && !readOnly && (
        <>
          <div className="color-slots">
            {(
              [
                ['primary', tr('Primario'), tr('clic sinistro')],
                ['secondary', tr('Secondario'), tr('clic destro')]
              ] as const
            ).map(([slot, label, hint]) => (
              <label key={slot} className="value-slot">
                <span className="value-swatch" style={{ background: grayCss(values[slot]) }} />
                <span className="small">
                  {label} <span className="muted">({hint})</span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={channel.max}
                  value={values[slot]}
                  aria-label={tr('Valore {0}', label.toLowerCase())}
                  onChange={(event) => set(slot, Number(event.target.value))}
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() => onValues({ primary: values.secondary, secondary: values.primary })}
              title={tr('Scambia i valori (X)')}
            >
              <Glyph name="swap" />
              <kbd>X</kbd>
            </button>
          </div>
          <label className="color-slider">
            <span className="small muted">
              {tr('Valore primario')} <span className="slider-value">{values.primary}</span>
            </span>
            <RangeInput
              type="range"
              min={0}
              max={channel.max}
              value={values.primary}
              style={{ background: `linear-gradient(to right, #000, ${grayCss(channel.max)})` }}
              onChange={(event) => set('primary', Number(event.target.value))}
            />
          </label>
          {channel.presets.length > 0 && (
            <section>
              <h3 className="panel-title">{tr('Valori tipici')}</h3>
              <div className="value-presets">
                {channel.presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="small-button"
                    title={tr(
                      '{0}{1} (clic sinistro: primario, destro: secondario)',
                      preset.hint ? preset.hint + ' — ' : '',
                      preset.value
                    )}
                    onClick={(event) => pick(event, preset.value)}
                    onContextMenu={(event) => pick(event, preset.value)}
                  >
                    <span className="value-dot" style={{ background: grayCss(preset.value) }} />
                    {preset.label} <span className="muted">{preset.value}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <label
            className="color-slider"
            title={tr('Distanza tra i grigi usati da Sfuma e Rumore (5 grigi attorno al primario)')}
          >
            <span className="small muted">
              {tr('Passo per Sfuma / Rumore')} <span className="slider-value">{rampStep}</span>
            </span>
            <RangeInput
              type="range"
              min={1}
              max={64}
              value={rampStep}
              onChange={(event) => onRampStep(Number(event.target.value))}
            />
          </label>
        </>
      )}
      <label
        className="color-slider"
        title={tr('Disegna i colori della texture sopra il canale, solo per orientarsi')}
      >
        <span className="small muted">
          {tr('Colori sopra')} <span className="slider-value">{overlay}%</span>
        </span>
        <RangeInput
          type="range"
          min={0}
          max={100}
          value={overlay}
          onChange={(event) => onOverlay(Number(event.target.value))}
        />
      </label>
    </div>
  )
}

function grayCss(value: number): string {
  return `rgb(${value}, ${value}, ${value})`
}
