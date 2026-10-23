// Segmented slider geometry (pure).

/** Thumb position as a CSS length: 0..steps mapped across the track, the 22 px thumb kept inside. */
export function segThumbLeft(value: number, steps: number): string {
  const pct = Math.round((Math.max(0, Math.min(steps, value)) / steps) * 1000) / 10
  return `calc(${pct}% - ${Math.round((pct / 100) * 22)}px)`
}

/** Nearest slider step for a value in [min, max] (for continuous settings shown as segments). */
export function toStep(value: number, min: number, max: number, steps: number): number {
  if (max <= min) return 0
  const t = (Math.max(min, Math.min(max, value)) - min) / (max - min)
  return Math.round(t * steps)
}

/** Value for a slider step (inverse of toStep). */
export function fromStep(step: number, min: number, max: number, steps: number): number {
  return min + ((max - min) * Math.max(0, Math.min(steps, step))) / steps
}
