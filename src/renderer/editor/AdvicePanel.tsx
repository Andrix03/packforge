import { Glyph } from '../ui/components'
import type { Advice } from './advice'
import { tr } from '../../shared/i18n'

/** Soft warnings about the texture (Beginner mode, or Pro with "Consigli" on). */
export function AdvicePanel({ advice }: { advice: readonly Advice[] }): React.JSX.Element {
  return (
    <section className="card advice-panel" aria-live="polite">
      <span className="lbl">{tr('Consigli')}</span>
      {advice.length === 0 ? (
        <p className="small success">
          {tr('Nessun problema: palette e contrasto sono nella norma.')}
        </p>
      ) : (
        <ul className="issues">
          {advice.map((item) => (
            <li key={item.id} className="small">
              <Glyph name="warning" />
              <span>{item.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
