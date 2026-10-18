import type {
  HeightOptions,
  NormalFilter,
  NormalOptions,
  OcclusionOptions
} from '../../shared/pbrGenerator'

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
    <section className="card generator-panel" aria-label="Generatore di rilievo">
      <h3 className="panel-title">Generatore di rilievo</h3>
      <button
        type="button"
        className="primary"
        disabled={heightFromColor !== null}
        title={
          heightFromColor ??
          'Altezza dai colori, poi normali e occlusione dall’altezza (un solo passo da annullare)'
        }
        onClick={() => onGenerate('all')}
      >
        Genera tutto dai colori
      </button>

      <h4 className="small">Altezza dai colori</h4>
      <p className="small muted">
        I pixel chiari restano in superficie, quelli scuri scendono (fughe, crepe).
      </p>
      <Range
        label="Profondità"
        value={Math.round(height.depth * 100)}
        unit="%"
        min={0}
        max={100}
        title="Quanto scende il pixel più scuro: 100% = il 25% del blocco previsto da LabPBR"
        onChange={(value) => setHeight({ depth: value / 100 })}
      />
      <Range
        label="Sfocatura"
        value={height.blur}
        unit=" px"
        min={0}
        max={4}
        title="Ammorbidisce il rilievo; 0 = ogni pixel ha la sua altezza (pixel art)"
        onChange={(blur) => setHeight({ blur })}
      />
      <Range
        label="Gradini"
        value={height.steps}
        unit=""
        min={0}
        max={8}
        title="Arrotonda l’altezza a pochi livelli, per un rilievo a cubetti; 0 = continuo"
        onChange={(steps) => setHeight({ steps })}
        format={(value) => (value < 2 ? 'no' : String(value))}
      />
      <label className="inline-check small" title="I pixel chiari diventano bassi invece che alti">
        <input
          type="checkbox"
          checked={height.invert}
          onChange={(event) => setHeight({ invert: event.target.checked })}
        />
        Inverti
      </label>
      <label
        className="inline-check small"
        title="Il pixel più scuro va in fondo e il più chiaro in superficie, qualunque sia la texture"
      >
        <input
          type="checkbox"
          checked={height.autoLevels}
          onChange={(event) => setHeight({ autoLevels: event.target.checked })}
        />
        Livelli automatici
      </label>
      <button
        type="button"
        disabled={heightFromColor !== null}
        title={heightFromColor ?? 'Sostituisce il canale Altezza'}
        onClick={() => onGenerate('height')}
      >
        Genera altezza
      </button>
      {heightFromColor && <p className="small muted">{heightFromColor}</p>}

      <h4 className="small">Normali e occlusione dall’altezza</h4>
      <Range
        label="Forza normali"
        value={Math.round(normals.strength * 100)}
        unit="%"
        min={10}
        max={400}
        title="100% = la pendenza vera del rilievo (quella che disegna il POM); di più = esagerata"
        onChange={(value) => setNormals({ strength: value / 100 })}
      />
      <label
        className="small select-field"
        title="Sobel è il classico; Scharr è più preciso in diagonale"
      >
        Filtro{' '}
        <select
          value={normals.filter}
          onChange={(event) => setNormals({ filter: event.target.value as NormalFilter })}
        >
          <option value="sobel">Sobel</option>
          <option value="scharr">Scharr</option>
        </select>
      </label>
      <label className="inline-check small" title="Scrive anche il canale Occlusione (B)">
        <input
          type="checkbox"
          checked={settings.withOcclusion}
          onChange={(event) => onSettings({ ...settings, withOcclusion: event.target.checked })}
        />
        Occlusione
      </label>
      {settings.withOcclusion && (
        <Range
          label="Forza occlusione"
          value={Math.round(occlusion.strength * 100)}
          unit="%"
          min={0}
          max={100}
          title="Quanto si scuriscono le fessure circondate da pixel più alti"
          onChange={(value) =>
            onSettings({ ...settings, occlusion: { ...occlusion, strength: value / 100 } })
          }
        />
      )}
      <button
        type="button"
        title="Sostituisce le normali (e l’occlusione) partendo dal canale Altezza"
        onClick={() => onGenerate('fromHeight')}
      >
        Genera normali{settings.withOcclusion ? ' e occlusione' : ''}
      </button>
      <label
        className="inline-check small"
        title="Dopo ogni tratto sul canale Altezza rigenera le normali (e l’occlusione)"
      >
        <input
          type="checkbox"
          checked={settings.auto}
          onChange={(event) => onSettings({ ...settings, auto: event.target.checked })}
        />
        Aggiorna mentre dipingi l’altezza
      </label>
      <label
        className="inline-check small"
        title="I bordi si collegano come quando il blocco si ripete; togli la spunta per texture che non si ripetono"
      >
        <input
          type="checkbox"
          checked={settings.wrap}
          onChange={(event) => onSettings({ ...settings, wrap: event.target.checked })}
        />
        Bordi ripetibili
      </label>
    </section>
  )
}

function Range({
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
      <input
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
