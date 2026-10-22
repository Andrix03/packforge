import { useRef } from 'react'

/**
 * Wraps an async action (a batch, an export, writing files) so a second click while it is still
 * starting or running does nothing: a double click must never run it twice. The phase state the
 * dialogs show changes only after their first await, too late to disable the button in time.
 */
export function useSingleFlight<A extends unknown[]>(
  action: (...args: A) => Promise<void>
): (...args: A) => void {
  const running = useRef(false)
  return (...args: A): void => {
    if (running.current) return
    running.current = true
    void action(...args).finally(() => {
      running.current = false
    })
  }
}
