import { useEffect, useState } from 'react'
import type { Issue, Severity } from '../../shared/packValidator'
import { runValidator, type ValidatorResult, type ValidatorSource } from './runValidator'

const SEVERITY: Record<Severity, { icon: string; label: string }> = {
  error: { icon: '✗', label: 'errori' },
  warning: { icon: '⚠', label: 'avvisi' },
  info: { icon: 'ℹ', label: 'note' }
}

type State =
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; result: ValidatorResult }
  | { status: 'error'; message: string }

/** Checks the pack's `_n` / `_s` maps: sizes, animation, emission, height, orphan files. */
export function ValidatorDialog({
  pack,
  vanilla,
  canOpen,
  onOpen,
  onClose
}: {
  pack: ValidatorSource
  vanilla: ValidatorSource | null
  /** Whether the texture of an issue's file can be opened in the editor. */
  canOpen: (path: string) => boolean
  onOpen: (path: string) => void
  onClose: () => void
}): React.JSX.Element {
  const [run, setRun] = useState(0)
  const [state, setState] = useState<State>({ status: 'running', done: 0, total: 0 })

  useEffect(() => {
    let cancelled = false
    runValidator(pack, vanilla, (done, total) => {
      if (!cancelled) setState({ status: 'running', done, total })
    }).then(
      (result) => {
        if (!cancelled) setState({ status: 'done', result })
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }
    )
    return () => {
      cancelled = true
    }
  }, [pack, vanilla, run])

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal validator"
        role="dialog"
        aria-label="Controllo delle mappe"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Controllo delle mappe _n / _s</h2>
        <p className="muted small">
          Dimensioni e animazione rispetto alla texture (come le legge Iris), emissione, altezza e
          file orfani.
          {!vanilla &&
            ' Carica un jar vanilla per controllare anche le mappe delle texture del gioco.'}
        </p>
        {state.status === 'running' && (
          <p className="small" data-testid="validator-progress">
            Controllo… {state.done}/{state.total}
          </p>
        )}
        {state.status === 'error' && <p className="field-error small">{state.message}</p>}
        {state.status === 'done' && (
          <Results result={state.result} canOpen={canOpen} onOpen={onOpen} />
        )}
        <div className="row">
          <button
            type="button"
            disabled={state.status === 'running'}
            onClick={() => {
              setState({ status: 'running', done: 0, total: 0 })
              setRun((r) => r + 1)
            }}
          >
            Ricontrolla
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}

function Results({
  result,
  canOpen,
  onOpen
}: {
  result: ValidatorResult
  canOpen: (path: string) => boolean
  onOpen: (path: string) => void
}): React.JSX.Element {
  const { issues, maps } = result
  if (issues.length === 0) {
    return (
      <p className="small" data-testid="validator-summary">
        ✓ Nessun problema in {maps === 1 ? '1 mappa' : `${maps} mappe`}.
      </p>
    )
  }
  const counts = (['error', 'warning', 'info'] as const)
    .map((severity) => [severity, issues.filter((i) => i.severity === severity).length] as const)
    .filter(([, n]) => n > 0)
  return (
    <>
      <p className="small" data-testid="validator-summary">
        {maps === 1 ? '1 mappa controllata' : `${maps} mappe controllate`}:{' '}
        {counts
          .map(([severity, n]) => `${SEVERITY[severity].icon} ${n} ${SEVERITY[severity].label}`)
          .join(' · ')}
      </p>
      <ul className="validator-issues">
        {issues.map((issue, index) => (
          <IssueRow key={index} issue={issue} canOpen={canOpen} onOpen={onOpen} />
        ))}
      </ul>
    </>
  )
}

function IssueRow({
  issue,
  canOpen,
  onOpen
}: {
  issue: Issue
  canOpen: (path: string) => boolean
  onOpen: (path: string) => void
}): React.JSX.Element {
  const slash = issue.path.lastIndexOf('/')
  return (
    <li className={`validator-issue ${issue.severity}`}>
      <span className="validator-icon" aria-label={SEVERITY[issue.severity].label}>
        {SEVERITY[issue.severity].icon}
      </span>
      <div>
        <strong>{issue.path.slice(slash + 1)}</strong>{' '}
        <span className="muted small">{issue.path.slice(0, slash)}</span>
        <p className="small">{issue.message}</p>
      </div>
      {canOpen(issue.path) && (
        <button type="button" className="small-button" onClick={() => onOpen(issue.path)}>
          Apri
        </button>
      )}
    </li>
  )
}
