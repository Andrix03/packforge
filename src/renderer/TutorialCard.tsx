import { useEffect, useState } from 'react'
import {
  completeStep,
  nextStep,
  TUTORIAL_STEPS,
  type TutorialState,
  type TutorialStep
} from '../shared/tutorial'
import { STEP_EVENT } from './tutorialEvents'

/** Restarts the tutorial from the settings ("Rifai il tutorial"). */
export const TUTORIAL_RESET_EVENT = 'packforge:tutorial-reset'

/**
 * First-run tutorial (Beginner mode): a small card in a corner that ticks each step when the
 * user really does it. Can be shrunk to a pill, or turned off.
 */
export function TutorialCard({
  compact = false
}: {
  /** Editor or Prova open: a one-line bar at the bottom instead of the card over the tools. */
  compact?: boolean
}): React.JSX.Element | null {
  const [state, setState] = useState<TutorialState | null>(null)
  const [beginner, setBeginner] = useState(false)
  const [open, setOpen] = useState(true)
  const [run, setRun] = useState(0)

  useEffect(() => {
    let current = true
    void window.api.invoke('settings:get').then((view) => {
      if (!current) return
      setState(view.settings.tutorial)
      setBeginner(view.settings.editorMode === 'beginner')
    })
    return () => {
      current = false
    }
  }, [run])

  useEffect(() => {
    const onReset = (): void => setRun((r) => r + 1)
    window.addEventListener(TUTORIAL_RESET_EVENT, onReset)
    return () => window.removeEventListener(TUTORIAL_RESET_EVENT, onReset)
  }, [])

  useEffect(() => {
    const onStep = (event: Event): void => {
      const step = (event as CustomEvent<TutorialStep>).detail
      setState((old) => {
        if (!old) return old
        const next = completeStep(old, step)
        if (next !== old) void window.api.invoke('settings:setTutorial', next)
        return next
      })
    }
    window.addEventListener(STEP_EVENT, onStep)
    return () => window.removeEventListener(STEP_EVENT, onStep)
  }, [])

  if (!state || !beginner || state.status === 'off') return null
  const current = nextStep(state)
  const done = state.done.length

  function turnOff(): void {
    const off: TutorialState = { ...state!, status: 'off' }
    setState(off)
    void window.api.invoke('settings:setTutorial', off)
  }

  const step = TUTORIAL_STEPS.find((s) => s.id === current)
  if (compact && state.status === 'active' && step) {
    return (
      <div className="tutorial-bar small" role="status" data-testid="tutorial-bar">
        <span>
          🎓 {done}/{TUTORIAL_STEPS.length} · <strong>{step.title}</strong>: {step.hint}
        </span>
        <button type="button" className="small-button" onClick={turnOff}>
          Nascondi
        </button>
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        className="tutorial-pill small-button"
        data-testid="tutorial-pill"
        onClick={() => setOpen(true)}
      >
        🎓 Tutorial {done}/{TUTORIAL_STEPS.length}
      </button>
    )
  }

  return (
    <aside className="tutorial-card" aria-label="Tutorial" data-testid="tutorial">
      <div className="tutorial-head">
        <strong>Il tuo primo blocco</strong>
        <span className="muted small">
          {done}/{TUTORIAL_STEPS.length}
        </span>
      </div>
      {state.status === 'done' ? (
        <p className="small">
          🎉 Fatto! Hai creato, salvato, provato e portato nel gioco il tuo primo blocco.
        </p>
      ) : (
        <ol className="tutorial-steps small">
          {TUTORIAL_STEPS.map((step) => (
            <li
              key={step.id}
              className={
                state.done.includes(step.id) ? 'done' : step.id === current ? 'current' : undefined
              }
            >
              {state.done.includes(step.id) ? '✓ ' : ''}
              {step.title}
              {step.id === current && <p className="muted">{step.hint}</p>}
            </li>
          ))}
        </ol>
      )}
      <div className="row">
        <button type="button" className="small-button" onClick={() => setOpen(false)}>
          Riduci
        </button>
        <button type="button" className="small-button" onClick={turnOff}>
          {state.status === 'done' ? 'Chiudi' : 'Nascondi il tutorial'}
        </button>
      </div>
    </aside>
  )
}
