import { Component, type ErrorInfo, type ReactNode } from 'react'

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
      `PackForge: errore nel componente "${this.props.what}"`,
      error,
      info.componentStack
    )
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <section className="card error-boundary" role="alert">
        <h2>Qualcosa è andato storto</h2>
        <p>
          {this.props.what} ha avuto un errore inatteso. Le modifiche non salvate sono nella bozza
          automatica: riaprendo la texture puoi ripristinarle.
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
          Chiudi e riprova
        </button>
      </section>
    )
  }
}
