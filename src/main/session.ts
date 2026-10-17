import type { PackSource } from './packSource'

// The pack currently open in the window. Renderer requests that touch pack
// files go through this, so the renderer never supplies file-system paths.

interface OpenedPack {
  source: PackSource
  /** Changes on every open; part of asset URLs so stale URLs stop resolving. */
  generation: number
}

let current: OpenedPack | null = null
let nextGeneration = 1

export function setCurrentPack(source: PackSource): OpenedPack {
  current = { source, generation: nextGeneration++ }
  return current
}

export function getCurrentPack(): OpenedPack | null {
  return current
}

export function closeCurrentPack(): void {
  current = null
}
