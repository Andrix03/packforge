import { useEffect, useState } from 'react'
import {
  blockstatePath,
  blockstateVariants,
  modelPath,
  resolveModel,
  texturePath
} from '../../shared/blockModel'
import { mapPath } from '../../shared/labpbr'
import { variantModel, variantNames, withRandomModels } from '../../shared/randomVariants'
import { backupBefore } from '../packs/backup'
import { errorMessage, fetchText, loadPng } from '../packs/packFetch'
import {
  guessBlockForTexture,
  listBlocks,
  resolveAssetUrl,
  type AssetSources
} from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { RangeInput } from '../ui/components'

interface Plan {
  block: string
  /** Block state JSON (the pack's, or the game's as a starting point). */
  state: unknown
  statePath: string
  /** The model the variants copy, and its own JSON. */
  baseModel: string
  baseJson: unknown
  /** Variant keys drawing the texture (e.g. `age=7`). */
  keys: string[]
}

type Phase =
  | { status: 'setup' }
  | { status: 'working'; text: string }
  | { status: 'done'; created: string[]; written: string[]; errors: string[] }

/** `assets/minecraft/textures/block/wheat_stage7.png` → `minecraft:block/wheat_stage7`. */
function textureId(path: string): string | null {
  const match = /^assets\/([^/]+)\/textures\/(.+)\.png$/.exec(path)
  return match ? `${match[1]}:${match[2]}` : null
}

async function loadJson(sources: AssetSources, path: string): Promise<unknown> {
  const url = resolveAssetUrl(sources, path)
  if (!url) return null
  try {
    return await (await fetch(url, { cache: 'no-store' })).json()
  } catch {
    return null
  }
}

/** Which block state variants draw the texture, and through which model. */
async function planFor(sources: AssetSources, path: string): Promise<Plan | string> {
  const id = textureId(path)
  const block = guessBlockForTexture(path.replace(/\.png$/, ''), listBlocks(sources))
  if (!id || !block) return 'Non trovo il blocco che usa questa texture.'
  const statePath = blockstatePath(block)
  const state = await loadJson(sources, statePath)
  const variants = blockstateVariants(state)
  if (variants.length === 0) {
    return `Il blockstate di ${block} non ha varianti semplici (le varianti casuali servono "variants").`
  }
  const load = (p: string): Promise<unknown> => loadJson(sources, p)
  let baseModel: string | null = null
  const keys: string[] = []
  for (const variant of variants) {
    const model = variant.models[0]!.model
    const resolved = await resolveModel(model, load)
    const draws = resolved.elements.some((e) =>
      Object.values(e.faces).some((f) => f?.texture && texturePath(f.texture.id) === path)
    )
    if (!draws) continue
    baseModel ??= model
    if (model === baseModel) keys.push(variant.key)
  }
  if (!baseModel) return `Nessuna variante di ${block} usa questa texture.`
  const baseJson = await load(modelPath(baseModel))
  if (!variantModel(baseModel, baseJson, id, `${id}_v2`)) {
    return `Il modello ${baseModel} prende la texture da un modello genitore: crea prima un modello tuo.`
  }
  return { block, state, statePath, baseModel, baseJson, keys }
}

/**
 * Random variants of a texture: copies `<name>_v2…` (with its maps and animation), a model for
 * each (the base model with the texture swapped) and the block state picking one per block, like
 * the ripe crops of Vanilla+ Crops. The copies start equal: the user then redraws them.
 */
export function RandomVariantsDialog({
  path,
  sources,
  onClose,
  onCreated
}: {
  path: string
  sources: AssetSources
  onClose: () => void
  /** Opens the first new texture in the editor; `written`: every file the dialog wrote. */
  onCreated: (path: string, written: string[]) => void
}): React.JSX.Element {
  const [plan, setPlan] = useState<Plan | string | null>(null)
  const [count, setCount] = useState(2)
  const [rotate, setRotate] = useState(false)
  const [phase, setPhase] = useState<Phase>({ status: 'setup' })
  useEscape(onClose, phase.status !== 'working')

  useEffect(() => {
    let current = true
    void planFor(sources, path).then((found) => current && setPlan(found))
    return () => {
      current = false
    }
  }, [sources, path])

  const folder = path.slice(0, path.lastIndexOf('/'))
  const name = path.slice(folder.length + 1, -'.png'.length)
  const taken = new Set(
    [...sources.pack.files]
      .filter((file) => file.startsWith(`${folder}/`) && file.endsWith('.png'))
      .map((file) => file.slice(folder.length + 1, -'.png'.length))
  )
  const names = variantNames(name, count, taken)
  const inPack = sources.pack.files.has(path)

  const create = useSingleFlight(async (): Promise<void> => {
    if (typeof plan !== 'object' || plan === null) return
    const id = textureId(path)!
    const pack = sources.pack
    const extras = (['normal', 'specular'] as const)
      .map((kind) => mapPath(path, kind))
      .filter((map) => pack.files.has(map))
    const mcmeta = pack.files.has(`${path}.mcmeta`) ? `${path}.mcmeta` : null
    const models = names.map((n) => `${plan.baseModel}${n.slice(name.length)}`)
    const touched = [
      plan.statePath,
      ...names.flatMap((n) => {
        const copy = `${folder}/${n}.png`
        return [
          copy,
          ...extras.map((map) => map.replace(`/${name}_`, `/${n}_`)),
          ...(mcmeta ? [`${copy}.mcmeta`] : [])
        ]
      }),
      ...models.map(modelPath)
    ]
    if (!(await backupBefore(`Varianti casuali di ${name}`, touched))) return
    const errors: string[] = []
    const created: string[] = []
    const written: string[] = []
    const check = (result: { ok: boolean; error?: string }, what: string): void => {
      if (result.ok) written.push(what)
      else errors.push(`${what}: ${result.error ?? 'errore'}`)
    }
    try {
      const albedo = await loadPng(pack, path)
      for (const [i, n] of names.entries()) {
        setPhase({ status: 'working', text: `Creo ${n}… ${i + 1}/${names.length}` })
        const copy = `${folder}/${n}.png`
        const saved = await window.api.invoke(
          'texture:save',
          copy,
          albedo.width,
          albedo.height,
          new Uint8Array(albedo.data)
        )
        check(saved, copy)
        if (saved.ok) created.push(copy)
        for (const map of extras) {
          const image = await loadPng(pack, map)
          check(
            await window.api.invoke(
              'texture:save',
              map.replace(`/${name}_`, `/${n}_`),
              image.width,
              image.height,
              new Uint8Array(image.data)
            ),
            map
          )
        }
        if (mcmeta) {
          check(
            await window.api.invoke('texture:saveMcmeta', copy, await fetchText(pack, mcmeta)),
            `${copy}.mcmeta`
          )
        }
        const model = variantModel(
          plan.baseModel,
          plan.baseJson,
          id,
          `${id}${n.slice(name.length)}`
        )
        check(
          await window.api.invoke(
            'model:saveJson',
            modelPath(models[i]!),
            `${JSON.stringify(model, null, 2)}\n`
          ),
          modelPath(models[i]!)
        )
      }
      const { json } = withRandomModels(plan.state, plan.baseModel, models, rotate)
      check(
        await window.api.invoke(
          'model:saveJson',
          plan.statePath,
          `${JSON.stringify(json, null, 2)}\n`
        ),
        plan.statePath
      )
    } catch (error) {
      errors.push(errorMessage(error))
    }
    setPhase({ status: 'done', created, written, errors })
  })

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form"
        role="dialog"
        aria-label="Varianti casuali"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>🎲 Varianti casuali di {name}</h2>
        {phase.status === 'done' ? (
          <>
            <p data-testid="variants-result">
              {phase.created.length} varianti create
              {phase.errors.length > 0 ? `, ${phase.errors.length} errori` : ''}. Ora ridisegnale:
              il gioco ne sceglie una a caso per ogni blocco.
            </p>
            {phase.errors.map((error) => (
              <p key={error} className="field-error small">
                {error}
              </p>
            ))}
            <div className="row">
              {phase.created[0] && (
                <button
                  type="button"
                  className="primary"
                  onClick={() => onCreated(phase.created[0]!, phase.written)}
                >
                  Apri {phase.created[0].slice(folder.length + 1, -'.png'.length)}
                </button>
              )}
              <button type="button" onClick={onClose}>
                Chiudi
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small">
              Più versioni della stessa texture: il gioco ne pesca una per ogni blocco, così un
              campo non sembra fatto con lo stampino (come Vanilla+ Crops sul raccolto maturo).
              Funziona senza mod.
            </p>
            {plan === null && <p className="muted">Cerco il blocco…</p>}
            {typeof plan === 'string' && <p className="field-error small">{plan}</p>}
            {typeof plan === 'object' && plan !== null && (
              <>
                <p className="small" data-testid="variants-plan">
                  {plan.block}: {plan.keys.length === 1 ? 'la variante' : 'le varianti'}{' '}
                  {plan.keys.map((k) => k || '(unica)').join(', ')}{' '}
                  {plan.keys.length === 1 ? 'userà' : 'useranno'} a caso {name} e {names.join(', ')}
                  .
                </p>
                <label className="preview-control">
                  <span>
                    Versioni in più <strong>{count}</strong>
                  </span>
                  <RangeInput
                    type="range"
                    min={1}
                    max={4}
                    value={count}
                    aria-label="Versioni in più"
                    onChange={(event) => setCount(Number(event.target.value))}
                  />
                </label>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={rotate}
                    onChange={(event) => setRotate(event.target.checked)}
                  />
                  Ruota a caso (4 orientamenti per versione)
                </label>
                <p className="muted small">
                  Le copie partono uguali a {name} (con le sue mappe _n/_s): poi le ridisegni.
                  Scrive anche {names.length} modelli e {plan.statePath.split('/').pop()} nel pack;
                  prima fa un backup.
                </p>
              </>
            )}
            {phase.status === 'working' && <p className="muted">{phase.text}</p>}
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={
                  typeof plan !== 'object' || plan === null || !inPack || phase.status === 'working'
                }
                title={inPack ? '' : 'Salva prima la texture nel pack'}
                onClick={() => create()}
              >
                Crea {names.length} varianti
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
