import type { PackSource } from './packSource'

// What the window has open: the user's pack and, optionally, a vanilla jar
// for reference. Renderer requests that touch files go through this, so the
// renderer never supplies file-system paths.

export type SourceRole = 'pack' | 'vanilla'

export interface OpenedSource {
  source: PackSource
  /** Changes on every open; part of asset URLs so stale URLs stop resolving. */
  generation: number
}

const opened: Record<SourceRole, OpenedSource | null> = { pack: null, vanilla: null }
let nextGeneration = 1

export function setSource(role: SourceRole, source: PackSource): OpenedSource {
  const entry = { source, generation: nextGeneration++ }
  opened[role] = entry
  return entry
}

export function getSource(role: SourceRole): OpenedSource | null {
  return opened[role]
}

export function closeSource(role: SourceRole): void {
  opened[role] = null
}
