import { useMemo, useState } from 'react'
import { coverageReport, type Missing } from '../../shared/coverage'
import type { TextureEntry } from '../../shared/textures'
import { useEscape } from '../useEscape'

type Filter = 'all' | Missing

const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tutte' },
  { id: 'both', label: 'Senza mappe' },
  { id: 'normal', label: 'Manca _n' },
  { id: 'specular', label: 'Manca _s' }
]

const MISSING_LABEL: Record<Missing, string> = {
  both: 'mancano _n e _s',
  normal: 'manca _n',
  specular: 'manca _s'
}

/** Rows drawn at most (the filter narrows big packs). */
const MAX_ROWS = 300

const percent = (part: number, total: number): string =>
  total === 0 ? '—' : `${Math.round((part / total) * 100)}%`

/** Which textures of the pack still miss `_n` / `_s`, with a shortcut to the batch dialog. */
export function CoverageDialog({
  files,
  canCreate,
  onOpen,
  onBatch,
  onClose
}: {
  files: readonly string[]
  /** Folder pack: the missing maps can be created in batch. */
  canCreate: boolean
  onOpen: (texture: TextureEntry) => void
  onBatch: (textures: TextureEntry[], maps: { specular: boolean; normal: boolean }) => void
  onClose: () => void
}): React.JSX.Element {
  const report = useMemo(() => coverageReport(files), [files])
  const [filter, setFilter] = useState<Filter>('all')
  useEscape(onClose)
  const shown = report.missing.filter((m) => filter === 'all' || m.missing === filter)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal batch"
        role="dialog"
        aria-label="Copertura delle mappe"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Copertura delle mappe _n / _s</h2>
        <p className="small" data-testid="coverage-summary">
          Mappe complete: {report.complete} di {report.total} texture (
          {percent(report.complete, report.total)})
        </p>
        <div className="coverage-bar" aria-hidden="true">
          <span style={{ width: percent(report.complete, report.total).replace('—', '0%') }} />
        </div>
        {report.gameMaps > 0 && (
          <p className="small muted">
            Più {report.gameMaps === 1 ? '1 mappa' : `${report.gameMaps} mappe`} per texture del
            gioco (non contate qui).
          </p>
        )}
        <table className="coverage-table small">
          <thead>
            <tr>
              <th>Cartella</th>
              <th>Texture</th>
              <th>_n e _s</th>
              <th>solo _n</th>
              <th>solo _s</th>
              <th>nessuna</th>
            </tr>
          </thead>
          <tbody>
            {report.folders.map((folder) => (
              <tr
                key={folder.folder}
                className={folder.skipped ? 'muted' : undefined}
                title={
                  folder.skipped ? 'Qui le mappe non servono: non è contata nel totale' : undefined
                }
              >
                <td>
                  {folder.folder}
                  {folder.skipped && ' (non servono)'}
                </td>
                <td>{folder.total}</td>
                <td>
                  {folder.both} <span className="muted">{percent(folder.both, folder.total)}</span>
                </td>
                <td>{folder.normalOnly}</td>
                <td>{folder.specularOnly}</td>
                <td>{folder.none}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="tabs small-tabs" role="radiogroup" aria-label="Mostra">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={filter === option.id}
              className={filter === option.id ? 'tab active' : 'tab'}
              onClick={() => setFilter(option.id)}
            >
              {option.label} (
              {option.id === 'all'
                ? report.missing.length
                : report.missing.filter((m) => m.missing === option.id).length}
              )
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="small">✓ Niente da completare qui.</p>
        ) : (
          <ul className="batch-list" aria-label="Texture incomplete">
            {shown.slice(0, MAX_ROWS).map(({ texture, missing }) => (
              <li key={texture.albedo} className="coverage-row">
                <span className="small">
                  {texture.name}{' '}
                  <span className="muted">
                    {texture.folder.replace(/^assets\/minecraft\/textures\//, '')} ·{' '}
                    {MISSING_LABEL[missing]}
                  </span>
                </span>
                <button type="button" className="small-button" onClick={() => onOpen(texture)}>
                  Apri
                </button>
              </li>
            ))}
          </ul>
        )}
        {shown.length > MAX_ROWS && (
          <p className="small muted">
            Mostrate {MAX_ROWS} di {shown.length}.
          </p>
        )}
        <div className="row">
          {canCreate && (
            <button
              type="button"
              className="primary"
              disabled={shown.length === 0}
              title="Apre “Applica in blocco” con queste texture già selezionate"
              onClick={() =>
                onBatch(
                  shown.map((m) => m.texture),
                  {
                    specular: filter !== 'normal',
                    normal: filter !== 'specular'
                  }
                )
              }
            >
              Crea le mappe mancanti ({shown.length})…
            </button>
          )}
          <button type="button" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}
