// Draws the question ask() left open (see ask.ts), with packforge-ui's Dialog: focus kept inside,
// Esc answers `cancel`, the backdrop does not (a question must be answered).
import { Button, Dialog } from 'packforge-ui'
import { useSyncExternalStore } from 'react'
import { answer, openQuestion, subscribe } from './ask'

export function AskHost(): React.JSX.Element {
  const question = useSyncExternalStore(subscribe, openQuestion)
  return (
    <Dialog
      open={question !== null}
      onOpenChange={(open) => {
        if (!open && question) answer(question.cancel)
      }}
      kind="alert"
      title={question?.title ?? ''}
      description={question?.message ?? ''}
      actions={question?.choices.map((choice) => (
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
