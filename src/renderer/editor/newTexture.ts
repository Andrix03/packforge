// Pure helpers for the new-texture wizard: where the file goes and its starting pixels.

import type { Rgba } from './pixels'
import { DEFAULT_RAMP, generateRamp, noiseColor, type RampOptions } from './ramp'
import { tr } from '../../shared/i18n'

/**
 * A softer ramp than the editor default: a starting point should not already trigger the
 * "darkest next to lightest" advice.
 */
export const STARTING_NOISE_RAMP: RampOptions = { ...DEFAULT_RAMP, contrast: 0.06 }

export const TEXTURE_SIZES = [16, 32, 64, 128] as const

export interface TextureSize {
  width: number
  height: number
}

/**
 * The sizes offered for a new texture: the usual squares, or, when it replaces a vanilla texture
 * of another shape (a 200×20 button, a 256×256 container), that size and its 2× and 4× versions.
 * A vanilla texture already drawn large (the 1024×256 logo, the panorama) gets ¼, ½, 1× and 2×.
 */
export function sizeOptions(vanilla: TextureSize | null): TextureSize[] {
  const squares = TEXTURE_SIZES.map((s) => ({ width: s, height: s }))
  if (!vanilla || (vanilla.width === 16 && vanilla.height === 16)) return squares
  const factors = Math.max(vanilla.width, vanilla.height) > 256 ? [0.25, 0.5, 1, 2] : [1, 2, 4]
  return factors
    .map((k) => ({ width: vanilla.width * k, height: vanilla.height * k }))
    .filter(
      (s) =>
        Number.isInteger(s.width) && Number.isInteger(s.height) && s.width >= 8 && s.height >= 8
    )
}

export type TextureStart = 'empty' | 'color' | 'noise'

/**
 * Validates a texture name typed by the user (without `.png`). Minecraft resource locations allow
 * only lowercase letters, digits, `_`, `-` and `.`; returns an Italian error or null.
 */
export function validateTextureName(name: string): string | null {
  if (name.trim() === '') return tr('Scrivi un nome.')
  if (!/^[a-z0-9_.-]+$/.test(name)) {
    return tr(
      'Usa solo lettere minuscole, numeri, _ - e . (Minecraft non accetta altri caratteri).'
    )
  }
  if (name.startsWith('.') || name.endsWith('.'))
    return tr('Il nome non può iniziare o finire con un punto.')
  return null
}

/**
 * The texture folder must be `assets/<namespace>/textures/...` for the game to find it. Returns an
 * Italian error or null.
 */
export function validateTextureFolder(folder: string): string | null {
  const segments = folder.split('/')
  if (segments.length < 3 || segments[0] !== 'assets' || segments[2] !== 'textures') {
    return tr('La cartella deve essere dentro assets/<namespace>/textures/.')
  }
  if (!segments.every((segment) => /^[a-z0-9_.-]+$/.test(segment) && !/^\.+$/.test(segment))) {
    return tr('Le cartelle possono contenere solo lettere minuscole, numeri, _ - e .')
  }
  return null
}

/** Straight RGBA8 pixels for a new texture. */
export function createTexturePixels(
  size: number | TextureSize,
  start: TextureStart,
  color: Rgba,
  random: () => number = Math.random
): Uint8Array {
  const { width, height } = typeof size === 'number' ? { width: size, height: size } : size
  const data = new Uint8Array(width * height * 4)
  if (start === 'empty') return data
  const opaque: Rgba = [color[0], color[1], color[2], 255]
  const ramp = start === 'noise' ? generateRamp(opaque, STARTING_NOISE_RAMP) : [opaque]
  for (let i = 0; i < width * height; i++) {
    data.set(start === 'noise' ? noiseColor(ramp, random) : opaque, i * 4)
  }
  return data
}
