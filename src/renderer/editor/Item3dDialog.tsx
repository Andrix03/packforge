import { useEffect, useState } from 'react'
import { DEFAULT_EXTRUDE, extrudeModel } from '../../shared/extrude'
import { canSplit, splitDefinition, type Item3dPlan } from '../../shared/item3d'
import type { FormatRange } from '../../shared/modelRules'
import type { RgbaImage } from '../../shared/pngCodec'
import { backupBefore } from '../packs/backup'
import { errorMessage, loadPng } from '../packs/packFetch'
import { resolveAssetUrl, type AssetSources } from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'
import { NAV_ICONS } from '../ui/icons'
import { tr } from '../../shared/i18n'

type Phase =
  | { status: 'setup' }
  | { status: 'working' }
  | { status: 'done'; written: string[]; errors: string[] }

/** The thicknesses offered, in model units (vanilla flat items are 1). */
const THICKNESSES = [1, 2, 4] as const

async function loadJson(sources: AssetSources, path: string): Promise<unknown> {
  const url = resolveAssetUrl(sources, path)
  if (!url) return null
  try {
    return await (await fetch(url, { cache: 'no-store' })).json()
  } catch {
    return null
  }
}

/**
 * "2D in the inventory, 3D in hand": writes the extruded model of the item texture and an item
 * definition drawing it everywhere but the GUI, the ground and item frames (vanilla model JSON,
 * no mods). The texture is read as saved in the pack.
 */
export function Item3dDialog({
  path,
  plan,
  sources,
  range,
  onClose,
  onDone
}: {
  path: string
  plan: Item3dPlan
  sources: AssetSources
  /** The pack's formats (null when no release loads it). */
  range: FormatRange | null
  onClose: () => void
  onDone: (written: string[]) => void
}): React.JSX.Element {
  const [loaded, setLoaded] = useState<{ image: RgbaImage | null; definition: unknown } | null>(
    null
  )
  const [thickness, setThickness] = useState<number>(DEFAULT_EXTRUDE.thickness)
  const [phase, setPhase] = useState<Phase>({ status: 'setup' })
  useEscape(onClose, phase.status !== 'working')

  useEffect(() => {
    let current = true
    void Promise.all([
      loadPng(sources.pack, path).catch(() => null),
      loadJson(sources, plan.definitionPath)
    ]).then(([image, definition]) => current && setLoaded({ image, definition }))
    return () => {
      current = false
    }
  }, [sources, path, plan.definitionPath])

  // Without the game's own definitions an item that changes with its state (a bow) would look
  // like a plain one and lose its states.
  const unknown =
    loaded && loaded.definition === null && !sources.vanilla
      ? tr(
          'Serve il gioco installato (nella cartella .minecraft) per leggere la definizione dell’oggetto.'
        )
      : null
  const check = !range
    ? { ok: false as const, error: tr('Nessuna versione del gioco carica questo pack.') }
    : unknown
      ? { ok: false as const, error: unknown }
      : loaded
        ? canSplit(loaded.definition, plan, range)
        : null
  const image = loaded?.image ?? null
  const model = image
    ? extrudeModel(
        image.width,
        image.height,
        (x, y) => image.data[(y * image.width + x) * 4 + 3]! > 0,
        plan.flatModel,
        { ...DEFAULT_EXTRUDE, thickness }
      )
    : null
  const replaced = [plan.model3dPath, plan.definitionPath].filter((p) => sources.pack.files.has(p))

  const apply = useSingleFlight(async (): Promise<void> => {
    if (!model?.ok || !check?.ok || !range) return
    const files: Array<[string, unknown]> = [
      [plan.model3dPath, model.model],
      [plan.definitionPath, splitDefinition(plan, check.tints, range)]
    ]
    if (!(await backupBefore(tr('3D in mano: {0}', plan.flatModel), replaced))) return
    setPhase({ status: 'working' })
    const written: string[] = []
    const errors: string[] = []
    for (const [file, json] of files) {
      try {
        const saved = await window.api.invoke(
          'model:saveJson',
          file,
          `${JSON.stringify(json, null, 2)}\n`
        )
        if (saved.ok) written.push(file)
        else errors.push(`${file}: ${saved.error}`)
      } catch (error) {
        errors.push(errorMessage(error))
      }
    }
    setPhase({ status: 'done', written, errors })
  })

  const problem =
    check && !check.ok
      ? check.error
      : model && !model.ok
        ? model.error
        : loaded && !image
          ? tr('Salva la texture nel pack prima.')
          : null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form"
        role="dialog"
        aria-label={tr('3D in mano')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph icon={NAV_ICONS.cube} />
          {tr('3D in mano: {0}', plan.flatModel.replace(/^minecraft:/, ''))}
        </h2>
        {phase.status === 'done' ? (
          <>
            <p data-testid="item3d-result">
              {tr(
                '{0} file scritti{1}.',
                phase.written.length,
                phase.errors.length > 0 ? tr(', {0} errori', phase.errors.length) : ''
              )}{' '}
              {tr('Ricarica le risorse nel gioco (F3+T) e prendi l’oggetto in mano.')}
            </p>
            {phase.errors.map((error) => (
              <p key={error} className="field-error small">
                {error}
              </p>
            ))}
            <div className="row">
              <button type="button" className="primary" onClick={() => onDone(phase.written)}>
                {tr('Fatto')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">
              {tr(
                'Nell’inventario, a terra e nelle cornici resta piatto; in mano e in testa diventa un modello 3D fatto dai suoi pixel. Modelli vanilla, funziona senza mod.'
              )}
            </p>
            <div className="tabs small-tabs" role="radiogroup" aria-label={tr('Spessore')}>
              {THICKNESSES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={thickness === value}
                  className={thickness === value ? 'tab active' : 'tab'}
                  onClick={() => setThickness(value)}
                >
                  {value === 1 ? tr('Sottile (come vanilla)') : tr('Spessore {0}', value)}
                </button>
              ))}
            </div>
            {!loaded ? (
              <p className="muted">{tr('Leggo la texture e la definizione…')}</p>
            ) : problem ? (
              <p className="field-error small" data-testid="item3d-problem">
                {problem}
              </p>
            ) : (
              model?.ok && (
                <p className="small" data-testid="item3d-plan">
                  {tr('{0} elementi, {1} facce.', model.elements, model.faces)}{' '}
                  {model.heavy && tr('Modello pesante: con tanti oggetti così il gioco rallenta.')}
                </p>
              )
            )}
            <p className="muted small path">
              {plan.model3dPath}
              <br />
              {plan.definitionPath}
            </p>
            {replaced.length > 0 && (
              <p className="small">
                <Glyph name="warning" />
                {tr('Sostituisce {0} file del pack (prima ne faccio il backup).', replaced.length)}
              </p>
            )}
            {phase.status === 'working' && <p className="muted">{tr('Scrivo i modelli…')}</p>}
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={problem !== null || !model?.ok || phase.status === 'working'}
                onClick={() => apply()}
              >
                {tr('Crea il modello 3D')}
              </button>
              <button type="button" onClick={onClose} disabled={phase.status === 'working'}>
                {tr('Annulla')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
