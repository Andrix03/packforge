import { Component, type ErrorInfo, type ReactNode } from 'react'
import { tr } from '../shared/i18n'

/**
 * Last line of defense: an error while rendering shows a message instead of a blank window, and
 * the user can try again (unsaved work survives in the draft autosave).
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void; what: string },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      tr('PackForge: errore nel componente "{0}"', this.props.what),
      error,
      info.componentStack
    )
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <section className="card error-boundary" role="alert">
        <h2>{tr('Qualcosa è andato storto')}</h2>
        <p>
          {tr(
            '{0} ha avuto un errore inatteso. Le modifiche non salvate sono nella bozza automatica: riaprendo la texture puoi ripristinarle.',
            this.props.what
          )}
        </p>
        <pre className="small muted">{this.state.error.message}</pre>
        <button
          type="button"
          className="primary"
          onClick={() => {
            this.setState({ error: null })
            this.props.onReset?.()
          }}
        >
          {tr('Chiudi e riprova')}
        </button>
      </section>
    )
  }
}
