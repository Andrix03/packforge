// Pure helpers for the new-texture wizard: where the file goes and its starting pixels.

import type { Rgba } from './pixels'
import { DEFAULT_RAMP, generateRamp, noiseColor, type RampOptions } from './ramp'

/**
 * A softer ramp than the editor default: a starting point should not already trigger the
 * "darkest next to lightest" advice.
 */
export const STARTING_NOISE_RAMP: RampOptions = { ...DEFAULT_RAMP, contrast: 0.06 }

export const TEXTURE_SIZES = [16, 32, 64, 128] as const

export type TextureStart = 'empty' | 'color' | 'noise'

/**
 * Validates a texture name typed by the user (without `.png`). Minecraft resource locations allow
 * only lowercase letters, digits, `_`, `-` and `.`; returns an Italian error or null.
 */
export function validateTextureName(name: string): string | null {
  if (name.trim() === '') return 'Scrivi un nome.'
  if (!/^[a-z0-9_.-]+$/.test(name)) {
    return 'Usa solo lettere minuscole, numeri, _ - e . (Minecraft non accetta altri caratteri).'
  }
  if (name.startsWith('.') || name.endsWith('.'))
    return 'Il nome non può iniziare o finire con un punto.'
  return null
}

/**
 * The texture folder must be `assets/<namespace>/textures/...` for the game to find it. Returns an
 * Italian error or null.
 */
export function validateTextureFolder(folder: string): string | null {
  const segments = folder.split('/')
  if (segments.length < 3 || segments[0] !== 'assets' || segments[2] !== 'textures') {
    return 'La cartella deve essere dentro assets/<namespace>/textures/.'
  }
  if (!segments.every((segment) => /^[a-z0-9_.-]+$/.test(segment) && !/^\.+$/.test(segment))) {
    return 'Le cartelle possono contenere solo lettere minuscole, numeri, _ - e .'
  }
  return null
}

/** Straight RGBA8 pixels for a new texture. */
export function createTexturePixels(
  size: number,
  start: TextureStart,
  color: Rgba,
  random: () => number = Math.random
): Uint8Array {
  const data = new Uint8Array(size * size * 4)
  if (start === 'empty') return data
  const opaque: Rgba = [color[0], color[1], color[2], 255]
  const ramp = start === 'noise' ? generateRamp(opaque, STARTING_NOISE_RAMP) : [opaque]
  for (let i = 0; i < size * size; i++) {
    data.set(start === 'noise' ? noiseColor(ramp, random) : opaque, i * 4)
  }
  return data
}
