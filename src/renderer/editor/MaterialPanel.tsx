import {
  GEMS,
  materialPreset,
  MATERIALS,
  METAL_CHOICES,
  type MaterialOptions
} from '../../shared/materialPresets'
import { Range } from './GeneratorPanel'

/** Material presets that fill the `_s` channels from the albedo. */
export function MaterialPanel({
  options,
  onOptions,
  onApply,
  disabled,
  selectionActive,
  accentCount
}: {
  options: MaterialOptions
  onOptions: (options: MaterialOptions) => void
  onApply: () => void
  /** Why the preset can't be applied (map and texture sizes differ), or null. */
  disabled: string | null
  /** A selection limits the preset to its pixels. */
  selectionActive: boolean
  /** Ore preset: how many pixels count as gem with the current sensitivity. */
  accentCount: number | null
}): React.JSX.Element {
  const preset = materialPreset(options.preset)
  return (
    <section className="card generator-panel" aria-label="Materiale">
      <h3 className="panel-title">Materiale</h3>
      <p className="small muted">
        Riempie levigatezza, riflettanza e porosità partendo dai colori della texture. Sono valori
        di partenza scelti da noi: la specifica LabPBR non dà tabelle per materiale.
      </p>
      <MaterialFields options={options} onOptions={onOptions} accentCount={accentCount} />
      <button
        type="button"
        className="primary"
        disabled={disabled !== null}
        title={
          disabled ??
          'Sostituisce levigatezza, riflettanza e porosità (un solo passo da annullare). L’emissione cambia solo con “Luminoso”.'
        }
        onClick={onApply}
      >
        Applica {preset.label.toLowerCase()}
        {selectionActive ? ' alla selezione' : ''}
      </button>
      {disabled && <p className="small muted">{disabled}</p>}
    </section>
  )
}

/** Preset buttons and the options of the chosen preset (also used by the batch dialog). */
export function MaterialFields({
  options,
  onOptions,
  accentCount = null
}: {
  options: MaterialOptions
  onOptions: (options: MaterialOptions) => void
  /** Ore preset: how many pixels count as gem (null = not shown). */
  accentCount?: number | null
}): React.JSX.Element {
  const preset = materialPreset(options.preset)
  const set = (change: Partial<MaterialOptions>): void => onOptions({ ...options, ...change })
  return (
    <>
      <div className="value-presets material-presets" role="group" aria-label="Preset materiale">
        {MATERIALS.map((material) => (
          <button
            key={material.id}
            type="button"
            className="small-button"
            aria-pressed={material.id === options.preset}
            title={material.hint}
            onClick={() => set({ preset: material.id, variation: material.variation })}
          >
            {material.label}
          </button>
        ))}
      </div>
      <p className="small muted">{preset.hint}</p>

      {preset.id === 'metal' && (
        <label className="small select-field" title="Il metallo predefinito (canale G 230–237)">
          Metallo{' '}
          <select
            value={options.metal}
            onChange={(event) => set({ metal: Number(event.target.value) })}
          >
            {METAL_CHOICES.map((metal) => (
              <option key={metal.value} value={metal.value}>
                {metal.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {preset.id === 'ore' && (
        <>
          <label className="small select-field" title="Cosa diventano i pixel colorati">
            Gemma{' '}
            <select value={options.gem} onChange={(event) => set({ gem: event.target.value })}>
              {GEMS.map((gem) => (
                <option key={gem.id} value={gem.id}>
                  {gem.label}
                </option>
              ))}
            </select>
          </label>
          <Range
            label="Sensibilità"
            value={Math.round((0.5 - options.accentThreshold) * 200)}
            unit="%"
            min={0}
            max={90}
            title="Quanto deve differire un pixel dalla pietra per contare come gemma: più alta = più pixel"
            onChange={(value) => set({ accentThreshold: 0.5 - value / 200 })}
          />
          {accentCount !== null && (
            <p className="small muted" data-testid="accent-count">
              Pixel gemma: {accentCount}
            </p>
          )}
        </>
      )}
      {preset.id === 'emissive' && (
        <Range
          label="Brilla da"
          value={Math.round(options.glowThreshold * 100)}
          unit="%"
          min={0}
          max={100}
          title="Chiarezza da cui un pixel emette luce: i più chiari brillano di più, gli altri restano spenti"
          onChange={(value) => set({ glowThreshold: value / 100 })}
        />
      )}
      <Range
        label="Variazione"
        value={Math.round(options.variation * 100)}
        unit="%"
        min={0}
        max={100}
        title="I pixel scuri (fessure) diventano più ruvidi, quelli chiari più lisci; 0 = tutto uguale"
        onChange={(value) => set({ variation: value / 100 })}
      />
    </>
  )
}
