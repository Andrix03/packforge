import type {
  HeightOptions,
  NormalFilter,
  NormalOptions,
  OcclusionOptions
} from '../../shared/pbrGenerator'
import { RangeInput } from '../ui/components'
import { tr } from '../../shared/i18n'

export interface GeneratorSettings {
  height: HeightOptions
  normals: NormalOptions
  occlusion: OcclusionOptions
  /** Write the AO channel when generating from the height. */
  withOcclusion: boolean
  /** Neighbours wrap around the edges (repeating block texture). */
  wrap: boolean
  /** Regenerate normals (and AO) after every stroke on the height. */
  auto: boolean
}

export type GenerateAction = 'height' | 'fromHeight' | 'all'

/** Height from the colors, normals and AO from the height (`_n` map). */
export function GeneratorPanel({
  settings,
  onSettings,
  onGenerate,
  heightFromColor
}: {
  settings: GeneratorSettings
  onSettings: (settings: GeneratorSettings) => void
  onGenerate: (action: GenerateAction) => void
  /** Why the height can't come from the colors (map and texture sizes differ), or null. */
  heightFromColor: string | null
}): React.JSX.Element {
  const { height, normals, occlusion } = settings
  const setHeight = (change: Partial<HeightOptions>): void =>
    onSettings({ ...settings, height: { ...height, ...change } })
  const setNormals = (change: Partial<NormalOptions>): void =>
    onSettings({ ...settings, normals: { ...normals, ...change } })
  return (
    <section className="card generator-panel" aria-label={tr('Generatore di rilievo')}>
      <h3 className="panel-title">{tr('Generatore di rilievo')}</h3>
      <button
        type="button"
        className="primary"
        disabled={heightFromColor !== null}
        title={
          heightFromColor ??
          tr(
            'Altezza dai colori, poi normali e occlusione dall’altezza (un solo passo da annullare)'
          )
        }
        onClick={() => onGenerate('all')}
      >
        {tr('Genera tutto dai colori')}
      </button>

      <h4 className="small">{tr('Altezza dai colori')}</h4>
      <p className="small muted">
        {tr('I pixel chiari restano in superficie, quelli scuri scendono (fughe, crepe).')}
      </p>
      <Range
        label={tr('Profondità')}
        value={Math.round(height.depth * 100)}
        unit="%"
        min={0}
        max={100}
        title={tr('Quanto scende il pixel più scuro: 100% = il 25% del blocco previsto da LabPBR')}
        onChange={(value) => setHeight({ depth: value / 100 })}
      />
      <Range
        label={tr('Sfocatura')}
        value={height.blur}
        unit=" px"
        min={0}
        max={4}
        title={tr('Ammorbidisce il rilievo; 0 = ogni pixel ha la sua altezza (pixel art)')}
        onChange={(blur) => setHeight({ blur })}
      />
      <Range
        label={tr('Gradini')}
        value={height.steps}
        unit=""
        min={0}
        max={8}
        title={tr('Arrotonda l’altezza a pochi livelli, per un rilievo a cubetti; 0 = continuo')}
        onChange={(steps) => setHeight({ steps })}
        format={(value) => (value < 2 ? 'no' : String(value))}
      />
      <label
        className="inline-check small"
        title={tr('I pixel chiari diventano bassi invece che alti')}
      >
        <input
          type="checkbox"
          checked={height.invert}
          onChange={(event) => setHeight({ invert: event.target.checked })}
        />
        {tr('Inverti')}
      </label>
      <label
        className="inline-check small"
        title={tr(
          'Il pixel più scuro va in fondo e il più chiaro in superficie, qualunque sia la texture'
        )}
      >
        <input
          type="checkbox"
          checked={height.autoLevels}
          onChange={(event) => setHeight({ autoLevels: event.target.checked })}
        />
        {tr('Livelli automatici')}
      </label>
      <button
        type="button"
        disabled={heightFromColor !== null}
        title={heightFromColor ?? tr('Sostituisce il canale Altezza')}
        onClick={() => onGenerate('height')}
      >
        {tr('Genera altezza')}
      </button>
      {heightFromColor && <p className="small muted">{heightFromColor}</p>}

      <h4 className="small">{tr('Normali e occlusione dall’altezza')}</h4>
      <Range
        label={tr('Forza normali')}
        value={Math.round(normals.strength * 100)}
        unit="%"
        min={10}
        max={400}
        title={tr(
          '100% = la pendenza vera del rilievo (quella che disegna il POM); di più = esagerata'
        )}
        onChange={(value) => setNormals({ strength: value / 100 })}
      />
      <label
        className="small select-field"
        title={tr('Sobel è il classico; Scharr è più preciso in diagonale')}
      >
        {tr('Filtro')}{' '}
        <select
          value={normals.filter}
          onChange={(event) => setNormals({ filter: event.target.value as NormalFilter })}
        >
          <option value="sobel">{tr('Sobel')}</option>
          <option value="scharr">{tr('Scharr')}</option>
        </select>
      </label>
      <label className="inline-check small" title={tr('Scrive anche il canale Occlusione (B)')}>
        <input
          type="checkbox"
          checked={settings.withOcclusion}
          onChange={(event) => onSettings({ ...settings, withOcclusion: event.target.checked })}
        />
        {tr('Occlusione')}
      </label>
      {settings.withOcclusion && (
        <Range
          label={tr('Forza occlusione')}
          value={Math.round(occlusion.strength * 100)}
          unit="%"
          min={0}
          max={100}
          title={tr('Quanto si scuriscono le fessure circondate da pixel più alti')}
          onChange={(value) =>
            onSettings({ ...settings, occlusion: { ...occlusion, strength: value / 100 } })
          }
        />
      )}
      <button
        type="button"
        title={tr('Sostituisce le normali (e l’occlusione) partendo dal canale Altezza')}
        onClick={() => onGenerate('fromHeight')}
      >
        {tr('Genera normali{0}', settings.withOcclusion ? tr(' e occlusione') : '')}
      </button>
      <label
        className="inline-check small"
        title={tr('Dopo ogni tratto sul canale Altezza rigenera le normali (e l’occlusione)')}
      >
        <input
          type="checkbox"
          checked={settings.auto}
          onChange={(event) => onSettings({ ...settings, auto: event.target.checked })}
        />
        {tr('Aggiorna mentre dipingi l’altezza')}
      </label>
      <label
        className="inline-check small"
        title={tr(
          'I bordi si collegano come quando il blocco si ripete; togli la spunta per texture che non si ripetono'
        )}
      >
        <input
          type="checkbox"
          checked={settings.wrap}
          onChange={(event) => onSettings({ ...settings, wrap: event.target.checked })}
        />
        {tr('Bordi ripetibili')}
      </label>
    </section>
  )
}

export function Range({
  label,
  value,
  unit,
  min,
  max,
  title,
  onChange,
  format = (v) => `${v}${unit}`
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  title: string
  onChange: (value: number) => void
  format?: (value: number) => string
}): React.JSX.Element {
  return (
    <label className="color-slider" title={title}>
      <span className="small muted">
        {label} <span className="slider-value">{format(value)}</span>
      </span>
      <RangeInput
        type="range"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}
