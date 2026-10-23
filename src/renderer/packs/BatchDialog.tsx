import { useMemo, useState } from 'react'
import { countPlan, planBatch } from '../../shared/batchMaps'
import { mapPath } from '../../shared/labpbr'
import {
  DEFAULT_MATERIAL,
  materialPreset,
  type MaterialOptions
} from '../../shared/materialPresets'
import { DEFAULT_HEIGHT, DEFAULT_NORMALS, DEFAULT_OCCLUSION } from '../../shared/pbrGenerator'
import type { TextureEntry } from '../../shared/textures'
import { Range } from '../editor/GeneratorPanel'
import { MaterialFields } from '../editor/MaterialPanel'
import type { AssetSources } from '../preview/modelSource'
import { backupBefore } from './backup'
import { BatchPreview } from './BatchPreview'
import { runBatch, type BatchResult, type BatchSettings } from './runBatch'
import type { ValidatorSource } from './runValidator'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'

/** Rows drawn at most in the texture list (the filter narrows big packs). */
const MAX_ROWS = 400

type Phase =
  | { status: 'setup' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; result: BatchResult }

const STEPS = ['Texture', 'Cosa fare', 'Anteprima', 'Applica'] as const

/**
 * Applies a material preset (`_s`) and/or the relief generator (`_n`) to many textures, in four
 * steps (canvas: Applica in blocco): choose the textures, what to do, see one before/after with
 * what will be written, apply. Every step stays mounted (hidden) so its settings are kept.
 */
export function BatchDialog({
  pack,
  sources = null,
  textures,
  initialFolder,
  initialSelection = null,
  initialMaps = { specular: true, normal: false },
  onClose
}: {
  pack: ValidatorSource
  /** For the before/after preview (no preview without it). */
  sources?: AssetSources | null
  /** The pack's textures (maps are not listed: they belong to their texture). */
  textures: readonly TextureEntry[]
  /** Its textures start selected. */
  initialFolder: string
  /** Albedo paths to start with instead of the folder (from the coverage report). */
  initialSelection?: readonly string[] | null
  /** Which maps start ticked. */
  initialMaps?: { specular: boolean; normal: boolean }
  onClose: () => void
}): React.JSX.Element {
  const [step, setStep] = useState(0)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        initialSelection ?? textures.filter((t) => t.folder === initialFolder).map((t) => t.albedo)
      )
  )
  const [doSpecular, setDoSpecular] = useState(initialMaps.specular)
  const [doNormal, setDoNormal] = useState(initialMaps.normal)
  const [overwrite, setOverwrite] = useState(false)
  const [material, setMaterial] = useState<MaterialOptions>(DEFAULT_MATERIAL)
  const [depth, setDepth] = useState(DEFAULT_HEIGHT.depth)
  const [occlusion, setOcclusion] = useState(true)
  const [wrap, setWrap] = useState(true)
  const [previewed, setPreviewed] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>({ status: 'setup' })
  useEscape(onClose, phase.status !== 'running')

  const settings = useMemo<BatchSettings>(
    () => ({
      material,
      relief: {
        height: { ...DEFAULT_HEIGHT, depth },
        normals: DEFAULT_NORMALS,
        occlusion: occlusion ? DEFAULT_OCCLUSION : null
      },
      wrap
    }),
    [material, depth, occlusion, wrap]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q === '' ? textures : textures.filter((t) => t.key.toLowerCase().includes(q))
  }, [textures, query])
  const chosen = textures.filter((t) => selected.has(t.albedo))
  const plan = planBatch(
    chosen.map((t) => ({
      albedo: t.albedo,
      hasNormal: t.normal !== null,
      hasSpecular: t.specular !== null
    })),
    { specular: doSpecular, normal: doNormal, overwrite }
  )
  const counts = countPlan(plan)
  const work = counts.create + counts.overwrite
  const sample = chosen.find((t) => t.albedo === previewed) ?? chosen[0] ?? null
  const sampleEntry = sample ? plan.find((entry) => entry.albedo === sample.albedo) : undefined
  const writes = (action: string | null | undefined): boolean =>
    action === 'create' || action === 'overwrite'

  const toggle = (albedo: string, on: boolean): void =>
    setSelected((all) => {
      const next = new Set(all)
      if (on) next.add(albedo)
      else next.delete(albedo)
      return next
    })

  const apply = useSingleFlight(async (): Promise<void> => {
    if (
      counts.overwrite > 0 &&
      !window.confirm(
        `Sovrascrivere ${counts.overwrite === 1 ? '1 mappa esistente' : `${counts.overwrite} mappe esistenti`}? Prima viene fatto un backup (lo trovi in Backup, per tornare indietro).`
      )
    ) {
      return
    }
    const animated = new Set(chosen.filter((t) => t.mcmeta).map((t) => t.albedo))
    const touched = plan.flatMap((entry) =>
      (['normal', 'specular'] as const)
        .filter((kind) => entry[kind] === 'create' || entry[kind] === 'overwrite')
        .flatMap((kind) => {
          const map = mapPath(entry.albedo, kind)
          return animated.has(entry.albedo) ? [map, `${map}.mcmeta`] : [map]
        })
    )
    if (
      !(await backupBefore(`Applica in blocco (${materialPreset(material.preset).label})`, touched))
    ) {
      return
    }
    setStep(3)
    setPhase({ status: 'running', done: 0, total: plan.length })
    const result = await runBatch(pack, plan, settings, (done, total) =>
      setPhase({ status: 'running', done, total })
    )
    setPhase({ status: 'done', result })
  })

  const files = plan.flatMap((entry) =>
    (['specular', 'normal'] as const)
      .filter((kind) => entry[kind] !== null)
      .map((kind) => ({ path: mapPath(entry.albedo, kind), action: entry[kind] }))
  )
  const running = phase.status === 'running'
  const summary = (
    <p className="small" data-testid="batch-summary">
      Crea {counts.create}, sovrascrive {counts.overwrite}, salta {counts.skip}
    </p>
  )

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !running && onClose()}>
      <div
        className="card modal batch wizard"
        role="dialog"
        aria-label="Applica in blocco"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="wizard-head">
          <h2>Applica in blocco</h2>
          <ol className="wizard-steps" aria-label="Passi">
            {STEPS.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  className={index === step ? 'ore-on' : 'ore'}
                  aria-current={index === step ? 'step' : undefined}
                  disabled={
                    running ||
                    (index === 3 && phase.status === 'setup') ||
                    (index < 3 && phase.status !== 'setup')
                  }
                  onClick={() => setStep(index)}
                >
                  {index < step && <Glyph name="check" />}
                  {index + 1}. {label}
                </button>
              </li>
            ))}
          </ol>
          <span className="muted small">
            {chosen.length} di {textures.length} texture
          </span>
        </header>

        {/* 1 · Texture */}
        <section className="wizard-step" hidden={step !== 0}>
          <p className="muted small">
            Crea le mappe di tante texture insieme: il materiale (_s) e/o il rilievo (_n), calcolati
            dai colori di ciascuna come nell’editor. Il segno _n o _s vuol dire che quella mappa
            esiste già.
          </p>
          <div className="row">
            <input
              type="search"
              aria-label="Filtra texture"
              placeholder="Filtra per nome o cartella, es. planks"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="small-button"
              onClick={() =>
                setSelected((all) => new Set([...all, ...visible.map((t) => t.albedo)]))
              }
            >
              Seleziona visibili
            </button>
            <button type="button" className="small-button" onClick={() => setSelected(new Set())}>
              Nessuna
            </button>
          </div>
          <ul className="batch-list" aria-label="Texture">
            {visible.slice(0, MAX_ROWS).map((texture) => (
              <li key={texture.albedo}>
                <label className="batch-row small">
                  <input
                    type="checkbox"
                    checked={selected.has(texture.albedo)}
                    onChange={(event) => toggle(texture.albedo, event.target.checked)}
                  />
                  {texture.name}
                  <span className="muted">
                    {texture.folder.replace(/^assets\/minecraft\/textures\//, '')}
                  </span>
                  {texture.normal && <span className="badge">_n</span>}
                  {texture.specular && <span className="badge">_s</span>}
                </label>
              </li>
            ))}
          </ul>
          {visible.length > MAX_ROWS && (
            <p className="small muted">
              Mostrate {MAX_ROWS} di {visible.length}: usa il filtro per trovare le altre.
            </p>
          )}
        </section>

        {/* 2 · Cosa fare */}
        <section className="wizard-step" hidden={step !== 1}>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={doSpecular}
              onChange={(event) => setDoSpecular(event.target.checked)}
            />
            Materiale (_s)
          </label>
          {doSpecular && (
            <div className="generator-panel batch-section">
              <MaterialFields options={material} onOptions={setMaterial} />
            </div>
          )}
          <label className="inline-check">
            <input
              type="checkbox"
              checked={doNormal}
              onChange={(event) => setDoNormal(event.target.checked)}
            />
            Rilievo (_n): altezza dai colori, normali e occlusione
          </label>
          {doNormal && (
            <div className="generator-panel batch-section">
              <Range
                label="Profondità"
                value={Math.round(depth * 100)}
                unit="%"
                min={0}
                max={100}
                title="Quanto scende il pixel più scuro: 100% = il 25% del blocco previsto da LabPBR"
                onChange={(value) => setDepth(value / 100)}
              />
              <label className="inline-check small">
                <input
                  type="checkbox"
                  checked={occlusion}
                  onChange={(event) => setOcclusion(event.target.checked)}
                />
                Occlusione
              </label>
              <label
                className="inline-check small"
                title="Togli la spunta per texture che non si ripetono"
              >
                <input
                  type="checkbox"
                  checked={wrap}
                  onChange={(event) => setWrap(event.target.checked)}
                />
                Bordi ripetibili
              </label>
            </div>
          )}

          <h3 className="panel-title">Mappe già presenti</h3>
          <label className="inline-radio small">
            <input
              type="radio"
              name="batch-existing"
              checked={!overwrite}
              onChange={() => setOverwrite(false)}
            />
            Lasciale come sono (consigliato)
          </label>
          <label className="inline-radio small">
            <input
              type="radio"
              name="batch-existing"
              checked={overwrite}
              onChange={() => setOverwrite(true)}
            />
            Sovrascrivile (l’emissione di un _s esistente resta)
          </label>
        </section>

        {/* 3 · Anteprima + what happens */}
        <section className="wizard-step wizard-preview" hidden={step !== 2}>
          <div className="wizard-preview-main">
            {chosen.length > 1 && (
              <label className="inline-select small">
                Texture mostrata
                <select
                  value={sample?.albedo ?? ''}
                  onChange={(event) => setPreviewed(event.target.value)}
                >
                  {chosen.slice(0, MAX_ROWS).map((t) => (
                    <option key={t.albedo} value={t.albedo}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {step === 2 && sample && sources && sampleEntry ? (
              <BatchPreview
                pack={pack}
                sources={sources}
                texture={sample}
                settings={settings}
                maps={{
                  normal: writes(sampleEntry.normal),
                  specular: writes(sampleEntry.specular)
                }}
              />
            ) : (
              <p className="muted small">
                {chosen.length === 0
                  ? 'Scegli almeno una texture al passo 1.'
                  : 'Anteprima non disponibile.'}
              </p>
            )}
          </div>
          <aside className="wizard-facts">
            <h3 className="ph">Cosa succede</h3>
            <div className="wizard-counts">
              <span>
                <strong className="count-new">{counts.create}</strong> nuove
              </span>
              <span>
                <strong className={counts.overwrite > 0 ? 'count-over' : ''}>
                  {counts.overwrite}
                </strong>{' '}
                riscritte
              </span>
              <span>
                <strong>{counts.skip}</strong> saltate
              </span>
            </div>
            <p className="small">
              {chosen.length === 1 ? '1 texture' : `${chosen.length} texture`}: il colore (.png) non
              viene toccato. Prima di scrivere viene fatto un backup (Pack › Backup per tornare
              indietro).
            </p>
            <p className="small warning-text">
              Si vede solo con uno shader LabPBR (Iris). Senza shader il gioco resta uguale.
            </p>
            <h3 className="ph">File che verranno scritti</h3>
            <ul className="wizard-files">
              {files.slice(0, 60).map((file) => (
                <li key={file.path} className={`file-${file.action}`}>
                  {file.action === 'create' ? '+' : file.action === 'overwrite' ? '~' : '='}{' '}
                  {file.path.slice(file.path.lastIndexOf('/') + 1)}
                </li>
              ))}
              {files.length > 60 && <li className="muted">… altri {files.length - 60}</li>}
            </ul>
          </aside>
        </section>

        {/* 4 · Applica */}
        <section className="wizard-step" hidden={step !== 3}>
          {phase.status === 'running' && (
            <p className="small" data-testid="batch-progress">
              Applico… {phase.done}/{phase.total}
            </p>
          )}
          {phase.status === 'done' && (
            <>
              <p className="small" data-testid="batch-result">
                <Glyph name="check" />
                {phase.result.written === 1
                  ? '1 mappa scritta'
                  : `${phase.result.written} mappe scritte`}
                {phase.result.errors.length > 0 && `, ${phase.result.errors.length} errori`}
              </p>
              {phase.result.errors.length > 0 && (
                <ul className="validator-issues">
                  {phase.result.errors.map((error) => (
                    <li key={error.path} className="validator-issue error">
                      <span className="validator-icon">
                        <Glyph name="cross" alone />
                      </span>
                      <div>
                        <strong>{error.path.split('/').pop()}</strong>
                        <p className="small">{error.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="small muted">
                Un backup è stato preso prima di scrivere: Pack › Backup lo ripristina. In gioco:
                F3+T per ricaricare il pack, con uno shader LabPBR acceso.
              </p>
            </>
          )}
        </section>

        <footer className="row wizard-foot">
          {phase.status === 'done' ? (
            <button type="button" className="primary" onClick={onClose}>
              Chiudi
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={running}>
                Annulla
              </button>
              {step > 0 && step < 3 && (
                <button type="button" onClick={() => setStep(step - 1)}>
                  ‹ Indietro
                </button>
              )}
              {step < 2 && (
                <button type="button" className="primary" onClick={() => setStep(step + 1)}>
                  Avanti: {STEPS[step + 1]?.toLowerCase()} ›
                </button>
              )}
              {summary}
              <button
                type="button"
                className={step === 2 ? 'primary' : undefined}
                disabled={work === 0 || running}
                onClick={() => apply()}
              >
                Applica a {work === 1 ? '1 mappa' : `${work} mappe`}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
