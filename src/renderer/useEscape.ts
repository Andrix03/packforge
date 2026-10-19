import { useEffect } from 'react'

/**
 * Esc closes the dialog. Listens in the capture phase and stops the event, so the editor under a
 * dialog does not also react (e.g. deselect). `enabled` false while an operation runs.
 */
export function useEscape(onEscape: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onEscape()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onEscape, enabled])
}
