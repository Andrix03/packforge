// Draws the question ask() left open (see ask.ts), with packforge-ui's Dialog: focus kept inside,
// Esc answers `cancel`, the backdrop does not (a question must be answered). Mounted only while a
// question is open: a dialog kept mounted closed may reuse a portal made before another modal
// opened, and that modal makes everything already in the page inert (the question with it).
import { Button, Dialog } from 'packforge-ui'
import { useSyncExternalStore } from 'react'
import { answer, openQuestion, subscribe } from './ask'

export function AskHost(): React.JSX.Element | null {
  const question = useSyncExternalStore(subscribe, openQuestion)
  if (!question) return null
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) answer(question.cancel)
      }}
      kind="alert"
      title={question.title}
      description={question.message}
      actions={question.choices.map((choice) => (
        <Button
          key={choice.value}
          variant={choice.primary ? 'main' : choice.danger ? 'danger' : 'quiet'}
          data-choice={choice.value}
          onClick={() => answer(choice.value)}
        >
          {choice.label}
        </Button>
      ))}
    />
  )
}
