import { useMemo, useState } from 'react'
import { countPlan, planBatch } from '../../shared/batchMaps'
import { DEFAULT_MATERIAL, type MaterialOptions } from '../../shared/materialPresets'
import { DEFAULT_HEIGHT, DEFAULT_NORMALS, DEFAULT_OCCLUSION } from '../../shared/pbrGenerator'
import type { TextureEntry } from '../../shared/textures'
import { Range } from '../editor/GeneratorPanel'
import { MaterialFields } from '../editor/MaterialPanel'
import { runBatch, type BatchResult } from './runBatch'
import type { ValidatorSource } from './runValidator'

/** Rows drawn at most in the texture list (the filter narrows big packs). */
const MAX_ROWS = 400

type Phase =
  | { status: 'setup' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; result: BatchResult }

/** Applies a material preset (`_s`) and/or the relief generator (`_n`) to many textures. */
export function BatchDialog({
  pack,
  textures,
  initialFolder,
  onClose
}: {
  pack: ValidatorSource
  /** The pack's textures (maps are not listed: they belong to their texture). */
  textures: readonly TextureEntry[]
  /** Its textures start selected. */
  initialFolder: string
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(textures.filter((t) => t.folder === initialFolder).map((t) => t.albedo))
  )
  const [doSpecular, setDoSpecular] = useState(true)
  const [doNormal, setDoNormal] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [material, setMaterial] = useState<MaterialOptions>(DEFAULT_MATERIAL)
  const [depth, setDepth] = useState(DEFAULT_HEIGHT.depth)
  const [occlusion, setOcclusion] = useState(true)
  const [wrap, setWrap] = useState(true)
  const [phase, setPhase] = useState<Phase>({ status: 'setup' })

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

  const toggle = (albedo: string, on: boolean): void =>
    setSelected((all) => {
      const next = new Set(all)
      if (on) next.add(albedo)
      else next.delete(albedo)
      return next
    })

  async function apply(): Promise<void> {
    if (
      counts.overwrite > 0 &&
      !window.confirm(
        `Sovrascrivere ${counts.overwrite === 1 ? '1 mappa esistente' : `${counts.overwrite} mappe esistenti`}? Non si può annullare.`
      )
    ) {
      return
    }
    setPhase({ status: 'running', done: 0, total: plan.length })
    const result = await runBatch(
      pack,
      plan,
      {
        material,
        relief: {
          height: { ...DEFAULT_HEIGHT, depth },
          normals: DEFAULT_NORMALS,
          occlusion: occlusion ? DEFAULT_OCCLUSION : null
        },
        wrap
      },
      (done, total) => setPhase({ status: 'running', done, total })
    )
    setPhase({ status: 'done', result })
  }

  if (phase.status !== 'setup') {
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="card modal batch" role="dialog" aria-label="Applica in blocco">
          <h2>Applica in blocco</h2>
          {phase.status === 'running' ? (
            <p className="small" data-testid="batch-progress">
              Applico… {phase.done}/{phase.total}
            </p>
          ) : (
            <>
              <p className="small" data-testid="batch-result">
                ✓{' '}
                {phase.result.written === 1
                  ? '1 mappa scritta'
                  : `${phase.result.written} mappe scritte`}
                {phase.result.errors.length > 0 && ` · ✗ ${phase.result.errors.length} errori`}
              </p>
              {phase.result.errors.length > 0 && (
                <ul className="validator-issues">
                  {phase.result.errors.map((error) => (
                    <li key={error.path} className="validator-issue error">
                      <span className="validator-icon">✗</span>
                      <div>
                        <strong>{error.path.split('/').pop()}</strong>
                        <p className="small">{error.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="row">
                <button type="button" className="primary" onClick={onClose}>
                  Chiudi
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal batch"
        role="dialog"
        aria-label="Applica in blocco"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Applica in blocco</h2>
        <p className="muted small">
          Crea le mappe di tante texture insieme: il materiale (_s) e/o il rilievo (_n), calcolati
          dai colori di ciascuna come nell’editor.
        </p>

        <h3 className="panel-title">1. Texture ({chosen.length} scelte)</h3>
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
            onClick={() => setSelected((all) => new Set([...all, ...visible.map((t) => t.albedo)]))}
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
              <label className="inline-check small">
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

        <h3 className="panel-title">2. Cosa applicare</h3>
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

        <h3 className="panel-title">3. Mappe già presenti</h3>
        <label className="inline-check small">
          <input
            type="radio"
            name="batch-existing"
            checked={!overwrite}
            onChange={() => setOverwrite(false)}
          />
          Lasciale come sono (consigliato)
        </label>
        <label className="inline-check small">
          <input
            type="radio"
            name="batch-existing"
            checked={overwrite}
            onChange={() => setOverwrite(true)}
          />
          Sovrascrivile (l’emissione di un _s esistente resta)
        </label>

        <p className="small" data-testid="batch-summary">
          Crea {counts.create} · sovrascrive {counts.overwrite} · salta {counts.skip}
        </p>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={work === 0}
            onClick={() => void apply()}
          >
            Applica a {work === 1 ? '1 mappa' : `${work} mappe`}
          </button>
          <button type="button" onClick={onClose}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}
