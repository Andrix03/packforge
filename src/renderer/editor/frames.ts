// Animated textures in the editor: a vertical strip of frames (the standard Minecraft layout) and
// its `.png.mcmeta`. Pure.

import { parseAnimation } from '../../shared/animation'
import type { Bounds } from './selection'

export interface AnimationSettings {
  frameHeight: number
  /** Ticks per frame (20 ticks = 1 second). */
  frametime: number
  interpolate: boolean
}

export type AnimationLoad =
  | { kind: 'none' }
  | { kind: 'editable'; settings: AnimationSettings; frameCount: number }
  /** Valid for the game but not editable here (e.g. frames in several columns). */
  | { kind: 'unsupported'; reason: string }

export const MAX_FRAMES = 64
export const MAX_FRAMETIME = 1000

/** Reads an mcmeta for the editor (null mcmeta = no file). */
export function animationFromMcmeta(mcmeta: unknown, width: number, height: number): AnimationLoad {
  if (mcmeta === null || mcmeta === undefined) return { kind: 'none' }
  const parsed = parseAnimation(mcmeta, width, height)
  if (!parsed.ok) return { kind: 'unsupported', reason: parsed.error }
  const animation = parsed.animation
  if (!animation) return { kind: 'none' }
  if (animation.columns !== 1 || animation.frameWidth !== width) {
    return {
      kind: 'unsupported',
      reason:
        'I frame sono disposti su più colonne: l’editor dei frame gestisce solo la striscia verticale standard.'
    }
  }
  const frametime = animation.frames[0]?.time ?? 1
  return {
    kind: 'editable',
    settings: { frameHeight: animation.frameHeight, frametime, interpolate: animation.interpolate },
    frameCount: animation.frameCount
  }
}

export function frameBounds(width: number, frameHeight: number, index: number): Bounds {
  return { x0: 0, y0: index * frameHeight, x1: width - 1, y1: (index + 1) * frameHeight - 1 }
}

/**
 * Rows `start .. start + deleteRows - 1` removed and `insert` (whole rows) put in their place.
 * Returns a new array; the input is not modified.
 */
export function spliceRows(
  data: Uint8ClampedArray,
  width: number,
  start: number,
  deleteRows: number,
  insert: Uint8ClampedArray | null
): Uint8ClampedArray {
  const row = width * 4
  const inserted = insert?.length ?? 0
  const out = new Uint8ClampedArray(data.length - deleteRows * row + inserted)
  out.set(data.subarray(0, start * row), 0)
  if (insert) out.set(insert, start * row)
  out.set(data.subarray((start + deleteRows) * row), start * row + inserted)
  return out
}

/**
 * The mcmeta to write: the original object with its other sections kept (e.g. "texture" blur/
 * clamp), and the animation updated. A custom "frames" order is kept only while the number of
 * frames is unchanged. Returns null when nothing is left to write (delete the file).
 */
export function buildMcmeta(
  original: unknown,
  settings: AnimationSettings | null,
  imageWidth: number,
  frameCount: number,
  originalFrameCount: number
): string | null {
  const root: Record<string, unknown> =
    typeof original === 'object' && original !== null && !Array.isArray(original)
      ? { ...(original as Record<string, unknown>) }
      : {}
  const previous =
    typeof root['animation'] === 'object' && root['animation'] !== null
      ? (root['animation'] as Record<string, unknown>)
      : {}
  delete root['animation']
  if (settings) {
    const animation: Record<string, unknown> = {}
    // Unknown future keys of the animation section are kept.
    for (const [key, value] of Object.entries(previous)) {
      if (!['frametime', 'interpolate', 'frames', 'width', 'height'].includes(key)) {
        animation[key] = value
      }
    }
    if (settings.frametime !== 1) animation['frametime'] = settings.frametime
    if (settings.interpolate) animation['interpolate'] = true
    if (settings.frameHeight !== imageWidth) {
      animation['width'] = imageWidth
      animation['height'] = settings.frameHeight
    }
    if (previous['frames'] !== undefined && frameCount === originalFrameCount) {
      animation['frames'] = previous['frames']
    }
    root['animation'] = animation
  }
  return Object.keys(root).length === 0 ? null : `${JSON.stringify(root, null, 2)}\n`
}

/**
 * The `.png.mcmeta` of a LabPBR map (`_n`/`_s`) of an animated texture: Iris reads a map's
 * animation from the map's own file (without it the whole strip becomes one squeezed frame), so
 * the maps get the texture's animation section, with explicit frame sizes scaled to the map's
 * resolution. null = no animation (delete the map's file).
 */
export function mapMcmeta(textureMcmeta: string | null, scale: number): string | null {
  if (textureMcmeta === null) return null
  const root = JSON.parse(textureMcmeta) as Record<string, unknown>
  const section = root['animation']
  if (typeof section !== 'object' || section === null) return null
  const animation = { ...(section as Record<string, unknown>) }
  for (const key of ['width', 'height']) {
    if (typeof animation[key] === 'number') animation[key] = Math.round(animation[key] * scale)
  }
  return `${JSON.stringify({ animation }, null, 2)}\n`
}
