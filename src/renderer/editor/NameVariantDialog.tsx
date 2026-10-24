import { useEffect, useState } from 'react'
import { modelPath } from '../../shared/blockModel'
import { tr } from '../../shared/i18n'
import type { Item3dPlan } from '../../shared/item3d'
import type { FormatRange } from '../../shared/modelRules'
import {
  NAME_SELECT_SINCE,
  nameVariantPlan,
  namedVariants,
  variantModel,
  withNameCase
} from '../../shared/nameVariant'
import { comparePackVersions } from '../../shared/packFormat'
import { backupBefore } from '../packs/backup'
import { errorMessage, loadPng } from '../packs/packFetch'
import { resolveAssetUrl, type AssetSources } from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'

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
 * "Variant by name": an anvil name (exact, capitals included) makes the item draw its own
 * texture. Writes the variant's texture (a copy of this one, to paint), its model (the item's
 * model with the new texture) and the item definition with the name case; then opens the copy.
 */
export function NameVariantDialog({
  path,
  plan,
  sources,
  range,
  onClose,
  onCreated
}: {
  /** The item's texture as saved in the pack (copied as the variant's start). */
  path: string
  plan: Item3dPlan
  sources: AssetSources
  range: FormatRange | null
  onClose: () => void
  onCreated: (texture: string, written: string[]) => void
}): React.JSX.Element {
  const [loaded, setLoaded] = useState<{ definition: unknown; model: unknown } | null>(null)
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [working, setWorking] = useState(false)
  useEscape(onClose, !working)

  useEffect(() => {
    let current = true
    void Promise.all([
      loadJson(sources, plan.definitionPath),
      loadJson(sources, modelPath(plan.flatModel))
    ]).then(([definition, model]) => current && setLoaded({ definition, model }))
    return () => {
      current = false
    }
  }, [sources, plan.definitionPath, plan.flatModel])

  const item = plan.flatModel.replace(':item/', ':')
  const variant = nameVariantPlan(item, name)
  const existing = loaded ? namedVariants(loaded.definition) : []
  const tooOld = !range || comparePackVersions(range.min, NAME_SELECT_SINCE) < 0
  const textureExists = variant ? sources.pack.files.has(variant.texturePath) : false
  const problem = tooOld
    ? tr('Serve la 1.21.5 o successiva: le versioni prima non sanno scegliere il modello dal nome.')
    : name.trim() !== '' && !variant
      ? tr('Il nome deve contenere almeno una lettera o una cifra.')
      : null

  const create = useSingleFlight(async (): Promise<void> => {
    if (!variant || !loaded || problem) return
    const touched = [plan.definitionPath, variant.modelPath]
    if (!(await backupBefore(tr('Variante per nome «{0}»', variant.name), touched))) return
    setWorking(true)
    const written: string[] = []
    const failed: string[] = []
    const json = async (file: string, value: unknown): Promise<void> => {
      const saved = await window.api.invoke(
        'model:saveJson',
        file,
        `${JSON.stringify(value, null, 2)}\n`
      )
      if (saved.ok) written.push(file)
      else failed.push(`${file}: ${saved.error}`)
    }
    try {
      // The texture: a copy of the item's own (never overwritten when it already exists).
      if (!textureExists) {
        const image = await loadPng(sources.pack, path)
        const saved = await window.api.invoke(
          'texture:save',
          variant.texturePath,
          image.width,
          image.height,
          new Uint8Array(image.data)
        )
        if (saved.ok) written.push(variant.texturePath)
        else failed.push(`${variant.texturePath}: ${saved.error}`)
      }
      await json(variant.modelPath, variantModel(loaded.model, plan.flatModel, variant.id))
      await json(
        plan.definitionPath,
        withNameCase(loaded.definition, variant.name, variant.id, plan.flatModel)
      )
    } catch (error) {
      failed.push(errorMessage(error))
    }
    setWorking(false)
    if (failed.length > 0) setErrors(failed)
    else onCreated(variant.texturePath, written)
  })

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="card modal form"
        role="dialog"
        aria-label={tr('Variante per nome')}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <h2>
          <Glyph name="book" />
          {tr('Variante per nome: {0}', item.replace(/^minecraft:/, ''))}
        </h2>
        <p className="muted small">
          {tr(
            'Rinominato nell’incudine con questo nome esatto (maiuscole comprese), l’oggetto usa una texture sua. Funziona senza mod, al posto delle CIT di OptiFine.'
          )}
        </p>
        <label className="field">
          {tr('Nome nell’incudine')}
          <input
            autoFocus
            value={name}
            maxLength={50}
            onChange={(event) => setName(event.target.value)}
            aria-label={tr('Nome nell’incudine')}
          />
        </label>
        {variant && !problem && (
          <p className="muted small path" data-testid="variant-plan">
            {variant.texturePath}
            <br />
            {variant.modelPath}
            <br />
            {plan.definitionPath}
          </p>
        )}
        {textureExists && <p className="small">{tr('La texture esiste già: la tengo com’è.')}</p>}
        {existing.length > 0 && (
          <p className="small" data-testid="variant-existing">
            {tr('Nomi già usati: {0}', existing.map((v) => `«${v.name}»`).join(', '))}
          </p>
        )}
        {problem && (
          <p className="field-error small" data-testid="variant-problem">
            {problem}
          </p>
        )}
        {errors.map((error) => (
          <p key={error} className="field-error small">
            {error}
          </p>
        ))}
        <div className="row">
          <button
            type="submit"
            className="primary"
            disabled={!variant || !loaded || problem !== null || working}
          >
            {working ? tr('Creazione…') : tr('Crea la variante e disegnala')}
          </button>
          <button type="button" onClick={onClose} disabled={working}>
            {tr('Annulla')}
          </button>
        </div>
      </form>
    </div>
  )
}
