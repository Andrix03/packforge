import type { PackSummary } from '../../shared/ipc'
import { compatibleReleases, type PackFormats } from '../../shared/mcmeta'
import { formatPackVersion, summarizeReleaseSpans } from '../../shared/packFormat'

interface PackOverviewProps {
  pack: PackSummary
  onClose: () => void
}

export function PackOverview({ pack, onClose }: PackOverviewProps): React.JSX.Element {
  const { description, formats, issues } = pack.mcmeta
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
          <p className="description">
            {description || <em className="muted">Nessuna descrizione</em>}
          </p>
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
