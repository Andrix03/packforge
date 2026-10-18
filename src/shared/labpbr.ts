// LabPBR 1.3 material maps: decode/encode of the `_n` and `_s` textures. Pure, shared by the
// preview (the shader mirrors these formulas) and the future PBR tools.
// Source (verified 2026-10-18): https://shaderlabs.org/wiki/LabPBR_Material_Standard
//   _n: R,G = normal X/Y in DirectX convention (R 0 = left, 255 = right; G 0 = up, 255 = down),
//       Z = sqrt(1 - x² - y²), B = material AO (0 = fully occluded), A = height (255 = surface,
//       0 = 25% deep; artists should use at least 1).
//   _s: R = perceptual smoothness, roughness = (1 - s)²; G 0–229 = F0 (linear), 230–237 = predefined
//       metals (albedo tints the reflections), 255 = albedo used as F0; B 0–64 = porosity,
//       65–255 = subsurface scattering; A 0–254 = emission, 255 = none.
// The spec leaves 238–254 unassigned: like shader packs that skip the predefined metals (and Photon
// for 238–254), they are read as an albedo metal. X/Y decode as byte / 255 * 2 - 1, like the packs.

export type Rgba = [number, number, number, number]

/** `_n` and `_s` used when a texture has none: flat normal, no AO, at the surface; no specular. */
export const FLAT_NORMAL: Rgba = [128, 128, 255, 255]
export const NO_SPECULAR: Rgba = [0, 0, 0, 0]

/** Deepest point of the height map, as a fraction of the block (height byte 0). */
export const MAX_DEPTH = 0.25

export interface PredefinedMetal {
  /** Green channel value. */
  value: number
  id: string
  /** Italian name for the UI. */
  label: string
  /** Complex index of refraction per RGB channel (n + ik). */
  n: [number, number, number]
  k: [number, number, number]
}

export const METALS: readonly PredefinedMetal[] = [
  {
    value: 230,
    id: 'iron',
    label: 'Ferro',
    n: [2.9114, 2.9497, 2.5845],
    k: [3.0893, 2.9318, 2.767]
  },
  {
    value: 231,
    id: 'gold',
    label: 'Oro',
    n: [0.18299, 0.42108, 1.3734],
    k: [3.4242, 2.3459, 1.7704]
  },
  {
    value: 232,
    id: 'aluminum',
    label: 'Alluminio',
    n: [1.3456, 0.96521, 0.61722],
    k: [7.4746, 6.3995, 5.3031]
  },
  {
    value: 233,
    id: 'chrome',
    label: 'Cromo',
    n: [3.1071, 3.1812, 2.323],
    k: [3.3314, 3.3291, 3.135]
  },
  {
    value: 234,
    id: 'copper',
    label: 'Rame',
    n: [0.27105, 0.67693, 1.3164],
    k: [3.6092, 2.6248, 2.2921]
  },
  { value: 235, id: 'lead', label: 'Piombo', n: [1.91, 1.83, 1.44], k: [3.51, 3.4, 3.18] },
  {
    value: 236,
    id: 'platinum',
    label: 'Platino',
    n: [2.3757, 2.0847, 1.8453],
    k: [4.2655, 3.7153, 3.1365]
  },
  {
    value: 237,
    id: 'silver',
    label: 'Argento',
    n: [0.15943, 0.14512, 0.13547],
    k: [3.9291, 3.19, 2.3808]
  }
]

/** Highest green value that is a plain F0 (229 ≈ 90%). */
export const MAX_F0_VALUE = 229
/** Highest blue value that is porosity; above it is subsurface scattering. */
export const MAX_POROSITY_VALUE = 64

export interface NormalTexel {
  /** Unit normal in texture space: +x right, +y down (DirectX), +z out of the surface. */
  normal: [number, number, number]
  /** 1 = no occlusion, 0 = fully occluded. */
  ao: number
  /** 1 = at the surface, 0 = deepest (MAX_DEPTH into the block). */
  height: number
}

export function decodeNormal([r, g, b, a]: Rgba): NormalTexel {
  const x = (r / 255) * 2 - 1
  const y = (g / 255) * 2 - 1
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y))
  return { normal: [x, y, z], ao: b / 255, height: a / 255 }
}

/** Bytes of a normal texel; the normal is normalized first (z only fixes its direction). */
export function encodeNormal(texel: NormalTexel): Rgba {
  const [x, y, z] = texel.normal
  const length = Math.hypot(x, y, Math.max(0, z)) || 1
  return [
    toByte(((x / length + 1) / 2) * 255),
    toByte(((y / length + 1) / 2) * 255),
    toByte(texel.ao * 255),
    toByte(texel.height * 255)
  ]
}

export type Reflectance =
  | { kind: 'dielectric'; f0: number }
  | { kind: 'metal'; metal: PredefinedMetal }
  /** The albedo is the F0 (green 255, and the unassigned 238–254). */
  | { kind: 'albedoMetal' }

export interface SpecularTexel {
  /** Perceptual smoothness 0–1. */
  smoothness: number
  reflectance: Reflectance
  /** 0–1; only on dielectrics with blue ≤ 64. */
  porosity: number
  /** Subsurface scattering 0–1 (blue 65–255). */
  sss: number
  /** 0–1 (alpha 0–254); alpha 255 means no emission. */
  emission: number
}

export function roughnessOf(smoothness: number): number {
  return (1 - smoothness) ** 2
}

export function smoothnessOf(roughness: number): number {
  return 1 - Math.sqrt(roughness)
}

export function decodeSpecular([r, g, b, a]: Rgba): SpecularTexel {
  let reflectance: Reflectance
  if (g <= MAX_F0_VALUE) reflectance = { kind: 'dielectric', f0: g / 255 }
  else {
    const metal = METALS.find((m) => m.value === g)
    reflectance = metal ? { kind: 'metal', metal } : { kind: 'albedoMetal' }
  }
  const sss = b > MAX_POROSITY_VALUE ? (b - 65) / 190 : 0
  const porosity = b <= MAX_POROSITY_VALUE ? b / MAX_POROSITY_VALUE : 0
  return {
    smoothness: r / 255,
    reflectance,
    porosity,
    sss,
    emission: a === 255 ? 0 : a / 254
  }
}

/** Bytes of a specular texel. SSS wins over porosity (they share the blue channel). */
export function encodeSpecular(texel: SpecularTexel): Rgba {
  const { reflectance } = texel
  const g =
    reflectance.kind === 'dielectric'
      ? Math.min(MAX_F0_VALUE, toByte(reflectance.f0 * 255))
      : reflectance.kind === 'metal'
        ? reflectance.metal.value
        : 255
  const b =
    texel.sss > 0
      ? toByte(65 + clamp01(texel.sss) * 190)
      : toByte(clamp01(texel.porosity) * MAX_POROSITY_VALUE)
  const a = texel.emission > 0 ? Math.min(254, toByte(texel.emission * 254)) : 255
  return [toByte(texel.smoothness * 255), g, b, a]
}

/** Reflectance at normal incidence of a conductor: ((n−1)² + k²) / ((n+1)² + k²). */
export function conductorF0(n: number, k: number): number {
  return ((n - 1) ** 2 + k * k) / ((n + 1) ** 2 + k * k)
}

export function metalF0(metal: PredefinedMetal): [number, number, number] {
  return [0, 1, 2].map((i) => conductorF0(metal.n[i]!, metal.k[i]!)) as [number, number, number]
}

export type MapKind = 'normal' | 'specular'

const MAP_SUFFIX: Record<MapKind, string> = { normal: '_n', specular: '_s' }

/** `…/stone.png` → `…/stone_n.png` (or `_s`). */
export function mapPath(albedoPath: string, kind: MapKind): string {
  return albedoPath.replace(/\.png$/i, `${MAP_SUFFIX[kind]}.png`)
}

/** Which LabPBR map a PNG path is, or null for an ordinary texture. */
export function mapKindOf(path: string): MapKind | null {
  if (/_n\.png$/i.test(path)) return 'normal'
  if (/_s\.png$/i.test(path)) return 'specular'
  return null
}

function toByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
