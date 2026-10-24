import { useEffect, useState } from 'react'
import { tr } from '../../shared/i18n'
import type { Item3dPlan } from '../../shared/item3d'
import { parseItemDefinition } from '../../shared/itemDefinition'
import type { FormatRange } from '../../shared/modelRules'
import { backupBefore } from '../packs/backup'
import { errorMessage } from '../packs/packFetch'
import { ItemPreview } from '../preview/ItemPreview'
import { resolveAssetUrl, type AssetSources } from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'

/** Every format from 1.21.4 on, when the pack's own range is unknown. */
const ANY_RANGE: FormatRange = { min: { major: 46, minor: 0 }, max: { major: 999, minor: 0 } }

/**
 * The item definition (`items/<name>.json`) as text, checked while typing against the versions
 * the pack targets, with the item drawn from the text being edited. Starts from the pack's
 * definition, else vanilla's (saving then gives the pack its own copy).
 */
export function DefinitionDialog({
  path,
  plan,
  sources,
  range,
  canvas,
  revision,
  onClose,
  onSaved
}: {
  path: string
  plan: Item3dPlan
  sources: AssetSources
  range: FormatRange | null
  canvas: HTMLCanvasElement | null
  revision: number
  onClose: () => void
  onSaved: (written: string[]) => void
}): React.JSX.Element {
  const [original, setOriginal] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEscape(onClose, !saving)
  const inPack = sources.pack.files.has(plan.definitionPath)

  useEffect(() => {
    let current = true
    const url = resolveAssetUrl(sources, plan.definitionPath)
    void (async () => {
      let json: unknown = { model: { type: 'minecraft:model', model: plan.flatModel } }
      if (url) {
        try {
          json = await (await fetch(url, { cache: 'no-store' })).json()
        } catch {
          // Unreadable: start from the plain model.
        }
      }
      if (current) setOriginal(`${JSON.stringify(json, null, 2)}\n`)
    })()
    return () => {
      current = false
    }
  }, [sources, plan.definitionPath, plan.flatModel])

  const value = text ?? original ?? ''
  let parsed: unknown = undefined
  let syntax: string | null = null
  try {
    parsed = JSON.parse(value) as unknown
  } catch (e) {
    syntax = e instanceof Error ? e.message : String(e)
  }
  const issues = parsed === undefined ? [] : parseItemDefinition(parsed, range ?? ANY_RANGE).issues
  const errors = issues.filter((i) => i.severity === 'error')
  const changed = text !== null && text !== original

  const save = useSingleFlight(async (): Promise<void> => {
    if (syntax || errors.length > 0) return
    if (
      inPack &&
      !(await backupBefore(tr('Definizione di {0}', plan.flatModel), [plan.definitionPath]))
    )
      return
    setSaving(true)
    setError(null)
    try {
      const saved = await window.api.invoke(
        'model:saveJson',
        plan.definitionPath,
        `${JSON.stringify(parsed, null, 2)}\n`
      )
      if (saved.ok) onSaved([plan.definitionPath])
      else setError(saved.error)
    } catch (e) {
      setError(errorMessage(e))
    }
    setSaving(false)
  })

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form definition-dialog"
        role="dialog"
        aria-label={tr('Definizione dell’oggetto')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph name="book" />
          {tr('Definizione: {0}', plan.definitionPath)}
        </h2>
        <p className="muted small">
          {inPack
            ? tr('La definizione del pack. Cosa disegnare, quando: modelli, condizioni, stati.')
            : tr('Parti da quella di vanilla: salvando il pack ne ha una sua copia.')}
        </p>
        <div className="definition-body">
          <div className="definition-text">
            {original === null ? (
              <p className="muted">{tr('Leggo la definizione…')}</p>
            ) : (
              <textarea
                value={value}
                spellCheck={false}
                aria-label={tr('Testo della definizione')}
                onChange={(event) => setText(event.target.value)}
              />
            )}
            <div className="definition-issues" data-testid="definition-issues">
              {syntax ? (
                <p className="field-error small">{tr('JSON non valido: {0}', syntax)}</p>
              ) : issues.length === 0 ? (
                <p className="small ok-text">
                  <Glyph name="check" />
                  {tr('Nessun problema per le versioni del pack.')}
                </p>
              ) : (
                issues.map((issue, i) => (
                  <p key={i} className={issue.severity === 'error' ? 'field-error small' : 'small'}>
                    {issue.severity !== 'error' && <Glyph name="warning" />}
                    {issue.message}
                  </p>
                ))
              )}
            </div>
          </div>
          <ItemPreview
            path={path}
            canvas={canvas}
            revision={revision}
            sources={sources}
            range={range}
            definition={parsed === undefined ? null : parsed}
          />
        </div>
        {error && <p className="field-error small">{error}</p>}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={saving || syntax !== null || errors.length > 0 || (!changed && inPack)}
            onClick={() => save()}
          >
            {tr('Salva la definizione')}
          </button>
          <button type="button" onClick={onClose} disabled={saving}>
            {tr('Annulla')}
          </button>
        </div>
      </div>
    </div>
  )
}
