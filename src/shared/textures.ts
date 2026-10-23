import { parentPath } from './fileTree'

/**
 * A texture with its LabPBR companions. `stone.png` + `stone_n.png` +
 * `stone_s.png` + `stone.png.mcmeta` become one entry.
 */
export interface TextureEntry {
  /** Pack-relative path without `.png`, e.g. `assets/minecraft/textures/block/stone`. */
  key: string
  folder: string
  name: string
  albedo: string
  normal: string | null
  specular: string | null
  /** `.png.mcmeta` next to the albedo (animation, blur/clamp). */
  mcmeta: string | null
}

const PNG = /\.png$/i

/**
 * Groups PNGs into textures. `X_n.png` / `X_s.png` count as LabPBR maps only
 * when `X.png` exists in the same folder; otherwise they are textures of their own.
 */
export function groupTextures(paths: readonly string[]): TextureEntry[] {
  const all = new Set(paths)
  // pack.png at the root is the pack's icon, not a texture.
  const pngs = paths.filter((path) => PNG.test(path) && path.toLowerCase() !== 'pack.png')
  const pngKeys = new Set(pngs.map(stripPng))
  const maps = new Map<string, { normal?: string; specular?: string }>()
  const albedos: string[] = []

  for (const path of pngs) {
    const key = stripPng(path)
    const match = /^(.*)_([ns])$/.exec(key)
    const baseKey = match?.[1]
    if (match && baseKey !== undefined && pngKeys.has(baseKey)) {
      const entry = maps.get(baseKey) ?? {}
      if (match[2] === 'n') entry.normal = path
      else entry.specular = path
      maps.set(baseKey, entry)
    } else {
      albedos.push(path)
    }
  }

  return albedos.map((albedo) => {
    const key = stripPng(albedo)
    const folder = parentPath(key)
    const companions = maps.get(key)
    const mcmeta = `${albedo}.mcmeta`
    return {
      key,
      folder,
      name: folder === '' ? key : key.slice(folder.length + 1),
      albedo,
      normal: companions?.normal ?? null,
      specular: companions?.specular ?? null,
      mcmeta: all.has(mcmeta) ? mcmeta : null
    }
  })
}

function stripPng(path: string): string {
  return path.replace(PNG, '')
}
