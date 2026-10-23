import { useState } from 'react'
import type { PackSummary } from '../../shared/ipc'
import { compatibleReleases, isOverlayActive, type PackFormats } from '../../shared/mcmeta'
import { formatPackVersion, GAME_RELEASES, summarizeReleaseSpans } from '../../shared/packFormat'
import { validatePackDescription } from '../../shared/validate'
import { DescriptionEditor, McText } from './DescriptionEditor'
import { IconEditor } from './IconEditor'
import { VersionEditor } from './VersionEditor'
import { Glyph } from '../ui/components'
import { tr } from '../../shared/i18n'

interface PackOverviewProps {
  pack: PackSummary
  onClose: () => void
  /**
   * Called with the refreshed summary after an edit. `filesChanged` is true
   * when files were added (icon, overlay folders), so the file list must reload.
   */
  onUpdated: (pack: PackSummary, filesChanged: boolean) => void
}

export function PackOverview({ pack, onClose, onUpdated }: PackOverviewProps): React.JSX.Element {
  const { description, descriptionKind, formats, overlays, issues } = pack.mcmeta
  const [editing, setEditing] = useState(false)
  const [editingVersions, setEditingVersions] = useState(false)
  const [editingIcon, setEditingIcon] = useState(false)
  const spans = summarizeReleaseSpans(compatibleReleases(formats))
  const errorCount = issues.filter((issue) => issue.severity === 'error').length

  return (
    <section className="card overview">
      <div className="overview-header">
        <div className="icon-column">
          {pack.iconDataUrl ? (
            <img className="pack-icon" src={pack.iconDataUrl} alt={tr('Icona del pack')} />
          ) : (
            <div className="pack-icon placeholder" aria-label={tr('Nessuna icona')}>
              ?
            </div>
          )}
          {pack.kind === 'folder' && !editingIcon && (
            <button type="button" className="link-button" onClick={() => setEditingIcon(true)}>
              {pack.iconDataUrl ? tr('Cambia') : tr('Aggiungi')}
            </button>
          )}
        </div>
        <div className="overview-title">
          <h2>
            {pack.name}{' '}
            <span className="badge">{pack.kind === 'zip' ? 'zip' : tr('cartella')}</span>
          </h2>
          {editing ? (
            <DescriptionForm
              initial={description}
              wasComponent={descriptionKind === 'component'}
              onCancel={() => setEditing(false)}
              onSaved={(updated) => {
                setEditing(false)
                onUpdated(updated, false)
              }}
            />
          ) : (
            <div className="description-row">
              <p className="description">
                {description ? (
                  <McText text={description} />
                ) : (
                  <em className="muted">{tr('Nessuna descrizione')}</em>
                )}
              </p>
              {pack.kind === 'folder' && (
                <button type="button" className="link-button" onClick={() => setEditing(true)}>
                  {tr('Modifica')}
                </button>
              )}
            </div>
          )}
          <code className="path" title={pack.path}>
            {pack.path}
          </code>
        </div>
        <button type="button" onClick={onClose}>
          {tr('Chiudi')}
        </button>
      </div>

      {editingIcon && (
        <IconEditor
          onCancel={() => setEditingIcon(false)}
          onSaved={(updated) => {
            setEditingIcon(false)
            onUpdated(updated, true)
          }}
        />
      )}

      <dl className="facts">
        {formatFacts(formats).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt>{tr('Compatibile con')}</dt>
          <dd>{spans.length > 0 ? spans.join(', ') : tr('nessuna versione gestita')}</dd>
        </div>
        {overlays.length > 0 && (
          <div>
            <dt>{tr('Overlay')}</dt>
            <dd>
              {overlays.map((overlay) => {
                const active = summarizeReleaseSpans(
                  GAME_RELEASES.filter((r) => isOverlayActive(overlay, r))
                )
                return (
                  <div key={overlay.directory}>
                    {overlay.directory} <Glyph name="arrowRight" />{' '}
                    {active.length > 0 ? active.join(', ') : tr('mai attivo')}
                  </div>
                )
              })}
            </dd>
          </div>
        )}
      </dl>

      {editingVersions ? (
        <VersionEditor
          pack={pack}
          onCancel={() => setEditingVersions(false)}
          onSaved={(updated) => {
            setEditingVersions(false)
            onUpdated(updated, true)
          }}
        />
      ) : (
        pack.kind === 'folder' && (
          <button
            type="button"
            className="link-button align-start"
            onClick={() => setEditingVersions(true)}
          >
            {tr('Modifica versioni e overlay')}
          </button>
        )
      )}

      {issues.length === 0 ? (
        <p className="success">{tr('pack.mcmeta è valido.')}</p>
      ) : (
        <div>
          <h3>
            {errorCount > 0
              ? tr('{0} {1} in pack.mcmeta', errorCount, errorCount === 1 ? 'errore' : 'errori')
              : tr('Avvisi su pack.mcmeta')}
          </h3>
          <ul className="issues">
            {issues.map((issue, i) => (
              <li key={i} className={issue.severity}>
                <Glyph name={issue.severity === 'error' ? 'cross' : 'warning'} />
                <span>
                  <span className="issue-tag">
                    {issue.severity === 'error' ? tr('Errore') : tr('Avviso')}
                  </span>
                  {issue.message}
                </span>
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
    // Esc inside the form cancels the edit (only here: a dialog on top keeps its own Esc).
    <div
      className="description-form"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !saving) {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      {wasComponent && (
        <p className="warning-text small">
          {tr('La descrizione attuale è in formato JSON: salvando diventerà testo con codici §.')}
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
          {saving ? tr('Salvataggio…') : tr('Salva in pack.mcmeta')}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          {tr('Annulla')}
        </button>
      </div>
    </div>
  )
}

function formatFacts(formats: PackFormats): Array<[string, string]> {
  const facts: Array<[string, string]> = []
  if (formats.range) {
    facts.push([
      'min_format, max_format',
      `${formatPackVersion(formats.range.min)} - ${formatPackVersion(formats.range.max)}`
    ])
  }
  if (formats.packFormat !== null) facts.push(['pack_format', String(formats.packFormat)])
  if (formats.supportedFormats) {
    const { min, max } = formats.supportedFormats
    facts.push(['supported_formats', min === max ? String(min) : `${min} – ${max}`])
  }
  return facts
}
