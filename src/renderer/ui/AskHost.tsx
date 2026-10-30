// Draws the question ask() left open (see ask.ts).
import { useEffect, useSyncExternalStore } from 'react'
import { answer, openQuestion, subscribe } from './ask'

export function AskHost(): React.JSX.Element | null {
  const question = useSyncExternalStore(subscribe, openQuestion)
  useEffect(() => {
    if (!question) return
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      answer(question!.cancel)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [question])
  if (!question) return null
  return (
    <div
      className="modal-backdrop ask-backdrop"
      role="presentation"
      onClick={() => answer(question.cancel)}
    >
      <div
        className="card modal ask-dialog"
        role="alertdialog"
        aria-label={question.title}
        aria-describedby="ask-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{question.title}</h2>
        <p id="ask-message" className="ask-message">
          {question.message}
        </p>
        <div className="row ask-choices">
          {question.choices.map((choice, i) => (
            <button
              key={choice.value}
              type="button"
              className={choice.primary ? 'ore-on' : choice.danger ? 'ore ask-danger' : 'ore'}
              // The main answer has the focus: Enter confirms it.
              autoFocus={choice.primary ?? i === question.choices.length - 1}
              data-choice={choice.value}
              onClick={() => answer(choice.value)}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
