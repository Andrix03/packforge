// Emissive overlays (Phase 18 logic): `<name>_e.png` drawn fullbright over the texture by
// OptiFine, Continuity (blocks, items) and ETF (entities), made from the LabPBR emission channel
// (`_s` alpha 0–254, 255 = none) that shader packs read. Research 2026-10-22: the suffix is `_e`
// unless `optifine/emissive.properties` sets `suffix.emissive`; the overlay's alpha scales its
// brightness (not a cutout). Pure.

export interface Pixels {
  width: number
  height: number
  data: ArrayLike<number>
}

export const DEFAULT_EMISSIVE_SUFFIX = '_e'

export interface EmissiveOptions {
  /** Below this emission (0–1) a pixel stays dark; 0 keeps every glowing pixel. */
  cutoff: number
  /** true: every glowing pixel at full brightness (alpha 255) instead of following the value. */
  full: boolean
}

export const DEFAULT_EMISSIVE: EmissiveOptions = { cutoff: 0, full: false }

/**
 * The `_e` overlay: the albedo's colors where `_s` emits, alpha = emission strength; elsewhere
 * transparent. A map of another resolution is sampled at the matching pixel (nearest).
 * null when nothing glows (no file to write).
 */
export function emissiveOverlay(
  albedo: Pixels,
  specular: Pixels,
  options: EmissiveOptions = DEFAULT_EMISSIVE
): Uint8ClampedArray | null {
  const out = new Uint8ClampedArray(albedo.width * albedo.height * 4)
  let any = false
  for (let y = 0; y < albedo.height; y++) {
    const sy = Math.min(specular.height - 1, Math.floor((y * specular.height) / albedo.height))
    for (let x = 0; x < albedo.width; x++) {
      const sx = Math.min(specular.width - 1, Math.floor((x * specular.width) / albedo.width))
      const byte = specular.data[(sy * specular.width + sx) * 4 + 3]!
      const at = (y * albedo.width + x) * 4
      const emission = byte === 255 ? 0 : byte / 254
      if (emission <= 0 || emission < options.cutoff || albedo.data[at + 3] === 0) continue
      out[at] = albedo.data[at]!
      out[at + 1] = albedo.data[at + 1]!
      out[at + 2] = albedo.data[at + 2]!
      out[at + 3] = options.full ? 255 : Math.max(1, Math.round(emission * 255))
      any = true
    }
  }
  return any ? out : null
}

/** `…/glowstone.png` → `…/glowstone_e.png`. */
export function emissivePath(texturePath: string, suffix = DEFAULT_EMISSIVE_SUFFIX): string {
  return `${texturePath.slice(0, -'.png'.length)}${suffix}.png`
}

/** Path of the OptiFine/Continuity settings file. */
export const EMISSIVE_PROPERTIES_PATH = 'assets/minecraft/optifine/emissive.properties'

/** Its content, or null when the default `_e` needs no file. */
export function emissiveProperties(suffix: string): string | null {
  return suffix === DEFAULT_EMISSIVE_SUFFIX ? null : `suffix.emissive=${suffix}\n`
}

/** A valid suffix: `_` then lowercase letters/digits, not one LabPBR already uses. */
export function validEmissiveSuffix(suffix: string): string | null {
  if (!/^_[a-z0-9]+$/.test(suffix)) return 'Il suffisso è "_" seguito da lettere minuscole o cifre.'
  if (suffix === '_n' || suffix === '_s') return `"${suffix}" è già usato dalle mappe LabPBR.`
  return null
}
