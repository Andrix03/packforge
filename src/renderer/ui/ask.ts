// The app's own question box, in place of the native window.confirm (the playtest found the native
// one out of style and without "Save and close"). ask() returns the value of the chosen button;
// Esc or the backdrop answer the `cancel` choice. <AskHost /> (AskHost.tsx, in App) draws the open question.
import { tr } from '../../shared/i18n'

export interface Choice {
  value: string
  label: string
  /** The green button (the safe or main answer). */
  primary?: boolean
  /** Throws work away: red text. */
  danger?: boolean
}

export interface Question {
  title: string
  message: string
  choices: readonly Choice[]
  /** What Esc and the backdrop answer. */
  cancel: string
  /** What a native OK means, for the UI scenarios that still answer native dialogs. */
  nativeOk: string
  resolve: (value: string) => void
}

let open: Question | null = null
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((listener) => listener())

/**
 * Asks a question with the given buttons. The UI scenarios set `window.__packforgeNativeDialogs`
 * to answer through window.confirm instead (OK = `nativeOk`, Cancel = `cancel`).
 */
export function ask(options: Omit<Question, 'resolve'>): Promise<string> {
  if ((window as { __packforgeNativeDialogs?: boolean }).__packforgeNativeDialogs) {
    return Promise.resolve(window.confirm(options.message) ? options.nativeOk : options.cancel)
  }
  return new Promise((resolve) => {
    // A new question replaces one left open (it answers as cancelled).
    open?.resolve(open.cancel)
    open = { ...options, resolve }
    emit()
  })
}

/** A yes / no question: true when the user chose `okLabel`. */
export async function confirmAction(
  message: string,
  okLabel: string = tr('Continua'),
  options: { title?: string; danger?: boolean } = {}
): Promise<boolean> {
  const answer = await ask({
    title: options.title ?? tr('Conferma'),
    message,
    choices: [
      { value: 'cancel', label: tr('Annulla') },
      { value: 'ok', label: okLabel, primary: !options.danger, danger: options.danger ?? false }
    ],
    cancel: 'cancel',
    nativeOk: 'ok'
  })
  return answer === 'ok'
}

export function answer(value: string): void {
  const question = open
  if (!question) return
  open = null
  emit()
  question.resolve(value)
}

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const openQuestion = (): Question | null => open
