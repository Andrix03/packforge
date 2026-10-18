import type { Advice } from './advice'

/** Soft warnings about the texture (Beginner mode, or Pro with "Consigli" on). */
export function AdvicePanel({ advice }: { advice: readonly Advice[] }): React.JSX.Element {
  return (
    <section className="card advice-panel" aria-live="polite">
      <strong className="small">Consigli</strong>
      {advice.length === 0 ? (
        <p className="small success">Nessun problema: palette e contrasto sono nella norma.</p>
      ) : (
        <ul className="issues">
          {advice.map((item) => (
            <li key={item.id} className="small">
              {item.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
