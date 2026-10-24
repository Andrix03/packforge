import { useEffect, useState } from 'react'
import { tr } from '../../shared/i18n'
import { ITEM_FEATURES } from '../../shared/itemDefinition'
import type { FormatRange } from '../../shared/modelRules'
import { migrateOverrides, type MigrationResult } from '../../shared/overridesMigration'
import { comparePackVersions } from '../../shared/packFormat'
import { errorMessage, fetchText, type FileSource } from './packFetch'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'
import type { AssetSources } from '../preview/modelSource'

interface Row {
  item: string
  definitionPath: string
  /** The pack already has a definition: left alone. */
  exists: boolean
  result: MigrationResult
}

const ITEM_MODEL = /^assets\/([a-z0-9_.-]+)\/models\/item\/([a-z0-9_.-]+)\.json$/

async function readJson(source: FileSource | null, path: string): Promise<unknown> {
  if (!source?.files.has(path)) return null
  try {
    return JSON.parse(await fetchText(source, path)) as unknown
  } catch {
    return null
  }
}

/**
 * Old item `overrides` (custom model data, bow pulling…, read up to 1.21.3) turned into item
 * definitions in items/ for 1.21.4+, the model files left as they are (old versions keep using
 * them). Items that already have a definition in the pack are not touched.
 */
export function OverridesDialog({
  sources,
  range,
  onClose,
  onDone
}: {
  sources: AssetSources
  range: FormatRange | null
  onClose: () => void
  onDone: () => void
}): React.JSX.Element {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [phase, setPhase] = useState<
    | { status: 'setup' }
    | { status: 'working' }
    | { status: 'done'; written: number; errors: string[] }
  >({ status: 'setup' })
  useEscape(onClose, phase.status !== 'working')

  useEffect(() => {
    let current = true
    void (async () => {
      const found: Row[] = []
      for (const path of [...sources.pack.files].sort()) {
        const m = ITEM_MODEL.exec(path)
        if (!m) continue
        const [, ns, name] = m as unknown as [string, string, string]
        const model = await readJson(sources.pack, path)
        const definitionPath = `assets/${ns}/items/${name}.json`
        const vanilla = (await readJson(sources.vanilla, definitionPath)) as {
          model?: unknown
        } | null
        const result = migrateOverrides(`${ns}:${name}`, model, vanilla?.model ?? null)
        if (result.converted === 0 && result.skipped.length === 0) continue
        found.push({
          item: `${ns}:${name}`,
          definitionPath,
          exists: sources.pack.files.has(definitionPath),
          result
        })
      }
      if (current) setRows(found)
    })()
    return () => {
      current = false
    }
  }, [sources])

  const writable = (rows ?? []).filter((r) => !r.exists && r.result.definition)
  const oldOnly = range !== null && comparePackVersions(range.max, ITEM_FEATURES.definitions) < 0

  const apply = useSingleFlight(async (): Promise<void> => {
    setPhase({ status: 'working' })
    let written = 0
    const errors: string[] = []
    for (const row of writable) {
      try {
        const saved = await window.api.invoke(
          'model:saveJson',
          row.definitionPath,
          `${JSON.stringify(row.result.definition, null, 2)}\n`
        )
        if (saved.ok) written++
        else errors.push(`${row.definitionPath}: ${saved.error}`)
      } catch (error) {
        errors.push(errorMessage(error))
      }
    }
    setPhase({ status: 'done', written, errors })
  })

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form overrides-dialog"
        role="dialog"
        aria-label={tr('Overrides degli oggetti')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph name="swap" />
          {tr('Overrides degli oggetti in items/')}
        </h2>
        <p className="muted small">
          {tr(
            'Dalla 1.21.4 il gioco ignora gli "overrides" nei modelli degli oggetti (custom_model_data, arco che si tende…) e legge le definizioni in items/. Le creo dai tuoi overrides; i modelli restano come sono per le versioni vecchie.'
          )}
        </p>
        {oldOnly && (
          <p className="small">
            <Glyph name="warning" />
            {tr(
              'Il pack si ferma prima della 1.21.4: le definizioni servono quando allarghi le versioni.'
            )}
          </p>
        )}
        {rows === null ? (
          <p className="muted">{tr('Leggo i modelli degli oggetti…')}</p>
        ) : rows.length === 0 ? (
          <p data-testid="overrides-none">{tr('Nessun modello di oggetto con overrides.')}</p>
        ) : (
          <ul className="overrides-list" data-testid="overrides-list">
            {rows.map((row) => (
              <li key={row.item}>
                <b>{row.item.replace(/^minecraft:/, '')}</b>{' '}
                {row.exists
                  ? tr('ha già items/{0}.json: lo lascio com’è.', row.item.split(':')[1] ?? '')
                  : tr('{0} overrides convertiti.', row.result.converted)}
                {row.result.skipped.map((note) => (
                  <span key={note} className="muted small">
                    <br />
                    {note}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        )}
        {phase.status === 'done' && (
          <>
            <p data-testid="overrides-result">{tr('{0} definizioni scritte.', phase.written)}</p>
            {phase.errors.map((error) => (
              <p key={error} className="field-error small">
                {error}
              </p>
            ))}
          </>
        )}
        <div className="row">
          {phase.status === 'done' ? (
            <button type="button" className="primary" onClick={onDone}>
              {tr('Fatto')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="primary"
                disabled={writable.length === 0 || phase.status === 'working'}
                onClick={() => apply()}
              >
                {tr('Scrivi {0} definizioni', writable.length)}
              </button>
              <button type="button" onClick={onClose} disabled={phase.status === 'working'}>
                {tr('Annulla')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
