import { useEffect, useState } from 'react'
import { modelPath, namespaced, type Vec3 } from '../../shared/blockModel'
import { tr } from '../../shared/i18n'
import type { DisplayTransform } from '../../shared/itemModel'
import { resolveItemModel } from '../../shared/itemPreview'
import type { FormatRange } from '../../shared/modelRules'
import { backupBefore } from '../packs/backup'
import { errorMessage } from '../packs/packFetch'
import { ItemPreview } from '../preview/ItemPreview'
import { resolveAssetUrl, type AssetSources } from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph, RangeInput } from '../ui/components'

const IDENTITY: DisplayTransform = { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1, 1, 1] }

async function loadJson(sources: AssetSources, path: string): Promise<unknown> {
  const url = resolveAssetUrl(sources, path)
  if (!url) return null
  try {
    return await (await fetch(url, { cache: 'no-store' })).json()
  } catch {
    return null
  }
}

/** The vanilla limits of a display entry (ItemTransform): translation ±80, scale up to 4. */
const FIELDS: Array<{
  key: keyof DisplayTransform
  label: () => string
  min: number
  max: number
  step: number
}> = [
  { key: 'rotation', label: () => tr('Rotazione (gradi)'), min: -180, max: 180, step: 1 },
  { key: 'translation', label: () => tr('Spostamento (pixel)'), min: -16, max: 16, step: 0.25 },
  { key: 'scale', label: () => tr('Scala'), min: 0, max: 4, step: 0.05 }
]

/**
 * How the item sits in each place (the model's `display`): rotation, offset and size in the
 * inventory, in first and third person, on the ground, on the head, in a frame. The preview
 * draws the edit live (first person and the slot in their real place); saving writes the
 * edited entries into the drawn model's JSON in the pack, the rest of it kept.
 */
export function DisplayDialog({
  path,
  sources,
  range,
  canvas,
  revision,
  onClose,
  onSaved
}: {
  path: string
  sources: AssetSources
  range: FormatRange | null
  canvas: HTMLCanvasElement | null
  revision: number
  onClose: () => void
  onSaved: (written: string[]) => void
}): React.JSX.Element {
  const [context, setContext] = useState('firstperson_righthand')
  const [drawn, setDrawn] = useState<string[]>([])
  const target = drawn[0] ? namespaced(drawn[0]) : null
  // The model's display as the game resolves it (own entries over its parents').
  const [current, setCurrent] = useState<{
    model: string
    display: Record<string, DisplayTransform>
  } | null>(null)
  const [edits, setEdits] = useState<Record<string, DisplayTransform>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEscape(onClose, !saving)

  useEffect(() => {
    if (!target) return
    let live = true
    void resolveItemModel(target, (p) => loadJson(sources, p)).then(
      (model) => live && setCurrent({ model: target, display: model.display })
    )
    return () => {
      live = false
    }
  }, [sources, target])

  const key = target ? `${target}|${context}` : ''
  const known = current && current.model === target ? current.display[context] : undefined
  const transform = edits[key] ?? known ?? IDENTITY
  const set = (field: keyof DisplayTransform, axis: number, value: number): void => {
    const next = [...transform[field]] as Vec3
    next[axis] = value
    setEdits({ ...edits, [key]: { ...transform, [field]: next } })
  }
  const editedModels = [...new Set(Object.keys(edits).map((k) => k.split('|')[0]!))]

  const save = useSingleFlight(async (): Promise<void> => {
    const files = editedModels.map((model) => modelPath(model))
    const own = files.filter((file) => sources.pack.files.has(file))
    if (!(await backupBefore(tr('Posizioni dell’oggetto'), own))) return
    setSaving(true)
    setError(null)
    const written: string[] = []
    try {
      for (const model of editedModels) {
        const file = modelPath(model)
        const json = await loadJson(sources, file)
        const base =
          typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {}
        const display = {
          ...(typeof base['display'] === 'object' && base['display'] !== null
            ? (base['display'] as Record<string, unknown>)
            : {})
        }
        for (const [k, value] of Object.entries(edits)) {
          const [m, slot] = k.split('|') as [string, string]
          if (m === model) display[slot] = value
        }
        const saved = await window.api.invoke(
          'model:saveJson',
          file,
          `${JSON.stringify({ ...base, display }, null, 2)}\n`
        )
        if (saved.ok) written.push(file)
        else throw new Error(`${file}: ${saved.error}`)
      }
      onSaved(written)
    } catch (e) {
      setError(errorMessage(e))
    }
    setSaving(false)
  })

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form display-dialog"
        role="dialog"
        aria-label={tr('Posizioni dell’oggetto')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph name="resize" />
          {tr('Posizioni dell’oggetto')}
        </h2>
        <p className="muted small">
          {tr(
            'Come sta l’oggetto in ogni posto: ruotalo, spostalo, ingrandiscilo. In prima persona e nell’inventario lo vedi dove lo mette il gioco.'
          )}
        </p>
        <div className="display-body">
          <ItemPreview
            path={path}
            canvas={canvas}
            revision={revision}
            sources={sources}
            range={range}
            context={context}
            onContext={setContext}
            onDrawn={setDrawn}
            displayOverride={target ? { model: target, slot: context, transform } : undefined}
          />
          <div className="display-fields">
            <p className="small" data-testid="display-target">
              {target
                ? tr('Modello: {0}', target.replace(/^minecraft:/, ''))
                : tr('Niente da disegnare in questo stato.')}
            </p>
            {FIELDS.map((field) => (
              <fieldset key={field.key} className="display-field">
                <legend className="lbl">{field.label()}</legend>
                {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                  <label key={axis} className="display-axis">
                    <span>{axis}</span>
                    <RangeInput
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={transform[field.key][i]}
                      aria-label={`${field.label()} ${axis}`}
                      disabled={!target}
                      onChange={(event) => set(field.key, i, Number(event.target.value))}
                    />
                    <input
                      type="number"
                      value={transform[field.key][i]}
                      step={field.step}
                      disabled={!target}
                      aria-label={`${field.label()} ${axis}, ${tr('valore')}`}
                      onChange={(event) => {
                        const value = Number(event.target.value)
                        if (Number.isFinite(value)) set(field.key, i, value)
                      }}
                    />
                  </label>
                ))}
              </fieldset>
            ))}
            <div className="row">
              <button
                type="button"
                disabled={!edits[key]}
                onClick={() => {
                  const next = { ...edits }
                  delete next[key]
                  setEdits(next)
                }}
              >
                {tr('Annulla le modifiche di questa vista')}
              </button>
            </div>
          </div>
        </div>
        {error && <p className="field-error small">{error}</p>}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={editedModels.length === 0 || saving}
            onClick={() => save()}
          >
            {tr('Salva le posizioni')}
          </button>
          <button type="button" onClick={onClose} disabled={saving}>
            {tr('Annulla')}
          </button>
        </div>
      </div>
    </div>
  )
}
