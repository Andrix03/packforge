/** Measure immediately: background Chromium windows can defer ResizeObserver delivery. */
export function observeCanvasSize(
  container: HTMLElement,
  onSize: (size: { width: number; height: number }) => void
): () => void {
  const measure = (): void => {
    const ratio = window.devicePixelRatio || 1
    onSize({
      width: Math.max(1, Math.round(container.clientWidth * ratio)),
      height: Math.max(1, Math.round(container.clientHeight * ratio))
    })
  }
  const observer = new ResizeObserver(measure)
  observer.observe(container)
  measure()
  return () => observer.disconnect()
}
