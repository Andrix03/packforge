// Controls of the LabPBR effects (light, exposure, bloom, POM, rain, metals, reflections, shadows,
// channel view), grouped like the Effetti screen of the design canvas. Used by Prova and by the
// editor while it paints the maps (the Effetti workspace).
import type { ReactNode } from 'react'
import { METAL_MODES, type MetalMode } from '../../shared/labpbr'
import { Picture, RangeInput } from '../ui/components'
import { LIGHT_PICTURES } from '../ui/pictures'
import {
  DEBUG_VIEWS,
  DEFAULT_EFFECTS,
  REFLECTION_MODES,
  SHADOW_MODES,
  TONE_MAPPINGS,
  type EffectSettings,
  type ReflectionMode,
  type ShadowMode,
  type ToneMappingId
} from './effects'
import { LIGHTING_PRESETS } from './lightingPresets'

export function EffectsControls({
  effects,
  onChange,
  hasNormal,
  pomExtra
}: {
  effects: EffectSettings
  onChange: (change: Partial<EffectSettings>) => void
  /** The texture has a _n map (otherwise POM has no height to read). */
  hasNormal: boolean
  /** Extra POM controls of the caller (Prova: compare with and without). */
  pomExtra?: ReactNode
}): React.JSX.Element {
  const preset = LIGHTING_PRESETS.find((p) => p.id === effects.lighting) ?? LIGHTING_PRESETS[0]!
  return (
    <div className="effects-controls">
      <section className="effects-group" aria-label="Luce e immagine">
        <h3 className="ph">Luce e immagine</h3>
        <div className="light-presets" role="radiogroup" aria-label="Luce degli effetti">
          {LIGHTING_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={effects.lighting === p.id}
              data-lighting={p.id}
              className={effects.lighting === p.id ? 'ore-on chip' : 'ore chip'}
              title={p.hint}
              onClick={() => onChange({ lighting: p.id })}
            >
              <Picture picture={LIGHT_PICTURES[p.id]} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <span className="muted small">{preset.hint}</span>
        <label className="preview-control">
          <span>
            Esposizione{' '}
            <strong>
              {effects.exposure > 0 ? '+' : ''}
              {effects.exposure.toFixed(1)} EV
            </strong>
          </span>
          <RangeInput
            type="range"
            min={-3}
            max={3}
            step={0.1}
            value={effects.exposure}
            aria-label="Esposizione"
            onChange={(event) => onChange({ exposure: Number(event.target.value) })}
          />
        </label>
        <label className="inline-select">
          <span className="muted small">Tone mapping</span>
          <select
            value={effects.toneMapping}
            aria-label="Tone mapping"
            onChange={(event) => onChange({ toneMapping: event.target.value as ToneMappingId })}
          >
            {TONE_MAPPINGS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="preview-control">
          <span>
            Bloom <strong>{effects.bloom > 0 ? effects.bloom.toFixed(2) : 'spento'}</strong>
          </span>
          <RangeInput
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={effects.bloom}
            aria-label="Bloom"
            onChange={(event) => onChange({ bloom: Number(event.target.value) })}
          />
        </label>
        <label className="preview-control">
          <span>
            Forza emissione <strong>×{effects.emission.toFixed(1)}</strong>
          </span>
          <RangeInput
            type="range"
            min={0}
            max={40}
            step={1}
            value={effects.emission}
            aria-label="Forza emissione"
            onChange={(event) => onChange({ emission: Number(event.target.value) })}
          />
        </label>
      </section>

      <section className="effects-group" aria-label="Parallasse (POM)">
        <h3 className="ph">Parallasse (POM)</h3>
        <label className="preview-control" title="100% = 25% di blocco, come la spec LabPBR">
          <span>
            Rilievo (POM){' '}
            <strong>{effects.pom > 0 ? `${Math.round(effects.pom * 100)}%` : 'spento'}</strong>
          </span>
          <RangeInput
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={effects.pom}
            aria-label="Rilievo POM"
            onChange={(event) => onChange({ pom: Number(event.target.value) })}
          />
        </label>
        {effects.pom > 0 && (
          <>
            <label className="preview-control" title="Più passi = rilievo più preciso, più lento">
              <span>
                Passi POM <strong>{effects.pomSamples}</strong>
              </span>
              <RangeInput
                type="range"
                min={8}
                max={128}
                step={8}
                value={effects.pomSamples}
                aria-label="Passi POM"
                onChange={(event) => onChange({ pomSamples: Number(event.target.value) })}
              />
            </label>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={effects.pomShadows}
                onChange={(event) => onChange({ pomShadows: event.target.checked })}
              />
              Ombre del rilievo
            </label>
            <label
              className="checkbox-inline"
              title="I lati dei gradini tra i pixel hanno la loro normale: rilievo a cubetti"
            >
              <input
                type="checkbox"
                checked={effects.pomSlopes}
                onChange={(event) => onChange({ pomSlopes: event.target.checked })}
              />
              Lati dei pixel (a cubetti)
            </label>
            {pomExtra}
            {!hasNormal && (
              <span className="muted small">
                Questa texture non ha _n: il rilievo usa l’altezza in _n.a.
              </span>
            )}
          </>
        )}
      </section>

      <section className="effects-group" aria-label="Tempo e materiali">
        <h3 className="ph">Tempo e materiali</h3>
        <label className="preview-control">
          <span>
            Pioggia{' '}
            <strong>
              {effects.rain > 0 ? `${Math.round(effects.rain * 100)}% bagnato` : 'no'}
            </strong>
          </span>
          <RangeInput
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={effects.rain}
            aria-label="Pioggia"
            onChange={(event) => onChange({ rain: Number(event.target.value) })}
          />
        </label>
        {effects.rain > 0 && (
          <span className="muted small">
            La porosità (_s B 0–64) decide quanto si scuriscono; sulle facce in alto sotto il cielo
            si formano pozze.
          </span>
        )}
        <label className="inline-select" title="Ogni shader pack legge i metalli a modo suo">
          <span className="muted small">Metalli</span>
          <select
            value={effects.metals}
            aria-label="Metalli"
            onChange={(event) => onChange({ metals: event.target.value as MetalMode })}
          >
            {METAL_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">
          {METAL_MODES.find((m) => m.id === effects.metals)?.hint}
        </span>
        <label
          className="inline-select"
          title="Cosa riflettono le superfici lisce e i metalli («Solo cielo» è più leggero)"
        >
          <span className="muted small">Riflessi</span>
          <select
            value={effects.reflections}
            aria-label="Riflessi"
            onChange={(event) => onChange({ reflections: event.target.value as ReflectionMode })}
          >
            {REFLECTION_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="inline-select"
          title="Ombre del sole (di notte della luna); «A pixel» come gli shader pack"
        >
          <span className="muted small">Ombre</span>
          <select
            value={effects.shadows}
            aria-label="Ombre"
            onChange={(event) => onChange({ shadows: event.target.value as ShadowMode })}
          >
            {SHADOW_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="effects-group" aria-label="Vista">
        <h3 className="ph">Vista</h3>
        <label className="inline-select">
          <span className="muted small">Canale</span>
          <select
            value={effects.view}
            aria-label="Vista canale"
            onChange={(event) => onChange({ view: Number(event.target.value) })}
          >
            {DEBUG_VIEWS.map((v, index) => (
              <option key={v.label} value={index}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">{DEBUG_VIEWS[effects.view]?.hint}</span>
      </section>

      <button type="button" onClick={() => onChange(DEFAULT_EFFECTS)}>
        Ripristina effetti
      </button>
      <span className="muted small">
        Anteprima approssimata: ogni shader pack interpreta LabPBR a modo suo.
      </span>
    </div>
  )
}
