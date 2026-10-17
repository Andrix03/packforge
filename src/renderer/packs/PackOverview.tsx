import { useState } from 'react'
import type { PackSummary } from '../../shared/ipc'
import { compatibleReleases, type PackFormats } from '../../shared/mcmeta'
import { formatPackVersion, summarizeReleaseSpans } from '../../shared/packFormat'
import { validatePackDescription } from '../../shared/validate'
import { DescriptionEditor, McText } from './DescriptionEditor'

interface PackOverviewProps {
  pack: PackSummary
  onClose: () => void
  /** Called with the refreshed summary after pack.mcmeta was edited. */
  onUpdated: (pack: PackSummary) => void
}

export function PackOverview({ pack, onClose, onUpdated }: PackOverviewProps): React.JSX.Element {
  const { description, descriptionKind, formats, issues } = pack.mcmeta
  const [editing, setEditing] = useState(false)
  const spans = summarizeReleaseSpans(compatibleReleases(formats))
  const errorCount = issues.filter((issue) => issue.severity === 'error').length

  return (
    <section className="card overview">
      <div className="overview-header">
        {pack.iconDataUrl ? (
          <img className="pack-icon" src={pack.iconDataUrl} alt="Icona del pack" />
        ) : (
          <div className="pack-icon placeholder" aria-label="Nessuna icona">
            ?
          </div>
        )}
        <div className="overview-title">
          <h2>
            {pack.name} <span className="badge">{pack.kind === 'zip' ? 'zip' : 'cartella'}</span>
          </h2>
          {editing ? (
            <DescriptionForm
              initial={description}
              wasComponent={descriptionKind === 'component'}
              onCancel={() => setEditing(false)}
              onSaved={(updated) => {
                setEditing(false)
                onUpdated(updated)
              }}
            />
          ) : (
            <div className="description-row">
              <p className="description">
                {description ? (
                  <McText text={description} />
                ) : (
                  <em className="muted">Nessuna descrizione</em>
                )}
              </p>
              {pack.kind === 'folder' && (
                <button type="button" className="link-button" onClick={() => setEditing(true)}>
                  Modifica
                </button>
              )}
            </div>
          )}
          <code className="path" title={pack.path}>
            {pack.path}
          </code>
        </div>
        <button type="button" onClick={onClose}>
          Chiudi
        </button>
      </div>

      <dl className="facts">
        {formatFacts(formats).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>Compatibile con</dt>
          <dd>{spans.length > 0 ? spans.join(', ') : 'nessuna versione gestita'}</dd>
        </div>
      </dl>

      {issues.length === 0 ? (
        <p className="success">pack.mcmeta è valido.</p>
      ) : (
        <div>
          <h3>
            {errorCount > 0
              ? `${errorCount} ${errorCount === 1 ? 'errore' : 'errori'} in pack.mcmeta`
              : 'Avvisi su pack.mcmeta'}
          </h3>
          <ul className="issues">
            {issues.map((issue, i) => (
              <li key={i} className={issue.severity}>
                <span className="issue-tag">
                  {issue.severity === 'error' ? 'Errore' : 'Avviso'}
                </span>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function DescriptionForm({
  initial,
  wasComponent,
  onCancel,
  onSaved
}: {
  initial: string
  wasComponent: boolean
  onCancel: () => void
  onSaved: (pack: PackSummary) => void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const invalid = validatePackDescription(value)

  async function save(): Promise<void> {
    setSaving(true)
    setError(null)
    const result = await window.api.invoke('pack:updateDescription', value)
    setSaving(false)
    if (result.ok) onSaved(result.pack)
    else setError(result.error)
  }

  return (
    <div className="description-form">
      {wasComponent && (
        <p className="warning-text small">
          La descrizione attuale è in formato JSON: salvando diventerà testo con codici §.
        </p>
      )}
      <DescriptionEditor value={value} onChange={setValue} invalid={invalid !== null} autoFocus />
      {(invalid ?? error) && <span className="field-error">{invalid ?? error}</span>}
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => void save()}
          disabled={saving || invalid !== null || value === initial}
        >
          {saving ? 'Salvataggio…' : 'Salva in pack.mcmeta'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Annulla
        </button>
      </div>
    </div>
  )
}

function formatFacts(formats: PackFormats): Array<[string, string]> {
  const facts: Array<[string, string]> = []
  if (formats.range) {
    facts.push([
      'min_format → max_format',
      `${formatPackVersion(formats.range.min)} → ${formatPackVersion(formats.range.max)}`
    ])
  }
  if (formats.packFormat !== null) facts.push(['pack_format', String(formats.packFormat)])
  if (formats.supportedFormats) {
    const { min, max } = formats.supportedFormats
    facts.push(['supported_formats', min === max ? String(min) : `${min} – ${max}`])
  }
  return facts
}
