import { useEffect, useState } from 'react'
import {
  blockstatePath,
  blockstateVariants,
  modelPath,
  resolveModel,
  texturePath
} from '../../shared/blockModel'
import {
  PLANT_SHAPES,
  plantShapeModel,
  topTextureId,
  type PlantShape
} from '../../shared/plantShapes'
import { backupBefore } from '../packs/backup'
import { errorMessage, loadPng } from '../packs/packFetch'
import { resolveAssetUrl, type AssetSources, type GrowthStage } from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'

/** A model of the plant to reshape, and the one texture it draws. */
interface Target {
  model: string
  texture: string
  /** Pack path of that texture. */
  path: string
  /** Variant keys (growth stages) drawing it. */
  keys: string[]
}

type Phase =
  | { status: 'setup' }
  | { status: 'working' }
  | { status: 'done'; written: string[]; errors: string[] }

async function loadJson(sources: AssetSources, path: string): Promise<unknown> {
  const url = resolveAssetUrl(sources, path)
  if (!url) return null
  try {
    return await (await fetch(url, { cache: 'no-store' })).json()
  } catch {
    return null
  }
}

/** The models of the block's growth stages (first random model of each), with their texture. */
async function targetsFor(
  sources: AssetSources,
  block: string,
  stages: readonly GrowthStage[]
): Promise<Target[]> {
  const variants = blockstateVariants(await loadJson(sources, blockstatePath(block)))
  const load = (p: string): Promise<unknown> => loadJson(sources, p)
  const targets = new Map<string, Target>()
  for (const stage of stages) {
    const variant = variants.find((v) => v.key === stage.key)
    const model = variant?.models[0]?.model
    if (!model) continue
    const known = targets.get(model)
    if (known) {
      known.keys.push(stage.key)
      continue
    }
    const resolved = await resolveModel(model, load)
    const ids = [
      ...new Set(
        resolved.elements.flatMap((e) =>
          Object.values(e.faces).flatMap((f) => (f?.texture ? [f.texture.id] : []))
        )
      )
    ]
    // The upper texture of our tall shape belongs to the plant; plants drawn by other textures
    // too (the pitcher) keep their own models.
    const own = ids.filter((id) => !(id.endsWith('_top') && ids.includes(id.slice(0, -4))))
    if (own.length !== 1) continue
    targets.set(model, { model, texture: own[0]!, path: texturePath(own[0]!), keys: [stage.key] })
  }
  return [...targets.values()]
}

/**
 * Writes a plant shape (vanilla planes, cross, bushy, tall) as the models of a crop's growth
 * stages, in the pack. Random variants made by PackForge have the stage model as parent, so they
 * follow. The tall shape also creates the empty `<texture>_top.png` it draws above.
 */
export function PlantShapeDialog({
  block,
  path,
  stages,
  sources,
  onClose,
  onDone
}: {
  block: string
  /** The open texture: "this stage" reshapes the model drawing it. */
  path: string
  stages: readonly GrowthStage[]
  sources: AssetSources
  onClose: () => void
  /** Every file written, for the editor to see them. */
  onDone: (written: string[]) => void
}): React.JSX.Element {
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [shape, setShape] = useState<PlantShape>('bushy')
  const [allStages, setAllStages] = useState(false)
  const [phase, setPhase] = useState<Phase>({ status: 'setup' })
  useEscape(onClose, phase.status !== 'working')

  useEffect(() => {
    let current = true
    void targetsFor(sources, block, stages).then((found) => current && setTargets(found))
    return () => {
      current = false
    }
  }, [sources, block, stages])

  const base = path.replace(/_v\d+\.png$/, '.png')
  const chosen = (targets ?? []).filter((t) => allStages || t.path === base)

  const apply = useSingleFlight(async (): Promise<void> => {
    const tops = shape === 'tall' ? chosen.map((t) => texturePath(topTextureId(t.texture))) : []
    const newTops = tops.filter((top) => !sources.pack.files.has(top))
    const touched = [...chosen.map((t) => modelPath(t.model)), ...newTops]
    if (!(await backupBefore(`Forma della pianta (${shape}) di ${block}`, touched))) return
    setPhase({ status: 'working' })
    const written: string[] = []
    const errors: string[] = []
    for (const target of chosen) {
      try {
        const top = shape === 'tall' ? topTextureId(target.texture) : null
        const file = modelPath(target.model)
        const saved = await window.api.invoke(
          'model:saveJson',
          file,
          `${JSON.stringify(plantShapeModel(shape, target.texture, top), null, 2)}\n`
        )
        if (saved.ok) written.push(file)
        else errors.push(`${file}: ${saved.error}`)
        const topPath = top ? texturePath(top) : null
        if (topPath && !sources.pack.files.has(topPath)) {
          // Same size as the stage texture (only its size is read), empty: drawn by the user.
          const size = await loadPng(
            sources.pack.files.has(target.path) ? sources.pack : sources.vanilla!,
            target.path
          ).catch(() => ({ width: 16, height: 16 }))
          const side = Math.min(size.width, size.height)
          const created = await window.api.invoke(
            'texture:save',
            topPath,
            side,
            side,
            new Uint8Array(side * side * 4)
          )
          if (created.ok) written.push(topPath)
          else errors.push(`${topPath}: ${created.error}`)
        }
      } catch (error) {
        errors.push(errorMessage(error))
      }
    }
    setPhase({ status: 'done', written, errors })
  })

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form"
        role="dialog"
        aria-label="Forma della pianta"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph name="leaf" />
          Forma della pianta: {block}
        </h2>
        {phase.status === 'done' ? (
          <>
            <p data-testid="shape-result">
              {phase.written.length} file scritti
              {phase.errors.length > 0 ? `, ${phase.errors.length} errori` : ''}.
              {shape === 'tall' && ' Disegna la parte alta nelle texture «_top».'}
            </p>
            {phase.errors.map((error) => (
              <p key={error} className="field-error small">
                {error}
              </p>
            ))}
            <div className="row">
              <button type="button" className="primary" onClick={() => onDone(phase.written)}>
                Fatto
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">
              Il modello 3D degli stadi: scritto nel pack come modello vanilla, funziona senza mod.
              Le varianti casuali seguono la forma del loro stadio.
            </p>
            <div className="tabs small-tabs wrap" role="radiogroup" aria-label="Forma">
              {PLANT_SHAPES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={shape === option.id}
                  className={shape === option.id ? 'tab active' : 'tab'}
                  title={option.hint}
                  onClick={() => setShape(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="small">{PLANT_SHAPES.find((s) => s.id === shape)?.hint}</p>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={allStages}
                onChange={(event) => setAllStages(event.target.checked)}
              />
              Tutti gli stadi (altrimenti solo quello di questa texture)
            </label>
            {targets === null ? (
              <p className="muted">Leggo i modelli…</p>
            ) : (
              <p className="muted small" data-testid="shape-plan">
                {chosen.length === 0
                  ? 'Nessun modello da cambiare per questa texture.'
                  : `Modelli: ${chosen.map((t) => t.model.replace(/^minecraft:/, '')).join(', ')}`}
              </p>
            )}
            {phase.status === 'working' && <p className="muted">Scrivo i modelli…</p>}
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={chosen.length === 0 || phase.status === 'working'}
                onClick={() => apply()}
              >
                Applica la forma
              </button>
              <button type="button" onClick={onClose} disabled={phase.status === 'working'}>
                Annulla
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
