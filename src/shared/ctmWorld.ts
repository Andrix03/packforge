// Connected textures in a scene: which tile each face of each block shows. Pure.
//
// A face's neighbours are read in the face's texture space: "right" is where its texture's u
// grows, "down" where v grows (taken from the quad's own vertices and UVs, so rotated faces work).
// A neighbour connects when it is the same block and its own face on that side is visible (the
// block in front of it is not the same block), as OptiFine/Continuity do without innerSeams.

import type { Quad } from './blockGeometry'
import {
  ctmTile,
  DOWN,
  DOWN_LEFT,
  DOWN_RIGHT,
  horizontalTile,
  LEFT,
  RIGHT,
  UP,
  UP_LEFT,
  UP_RIGHT,
  verticalTile,
  expandTiles,
  type CtmMethod,
  type Properties
} from './ctm'
import { tr } from './i18n'

export type Vec3 = [number, number, number]

/** The methods the preview can show. */
export type PreviewMethod = Extract<CtmMethod, 'ctm' | 'horizontal' | 'vertical'>

export interface CtmSet {
  /** The .properties file. */
  path: string
  method: PreviewMethod
  /** Pack paths of the tiles, in order. */
  tiles: string[]
}

/** Unit axis vector closest to `v` (sign kept), or null for a zero vector. */
function axis(v: Vec3): Vec3 | null {
  const abs = v.map(Math.abs)
  const max = Math.max(...abs)
  if (max < 1e-9) return null
  const i = abs.indexOf(max)
  const out: Vec3 = [0, 0, 0]
  out[i] = Math.sign(v[i]!)
  return out
}

/** World directions of the face's texture +u (right) and +v (down), as unit axes. */
export function faceAxes(quad: Quad): { right: Vec3; down: Vec3 } | null {
  const [p0, p1, , p3] = quad.positions
  const [t0, t1, , t3] = quad.uvs
  const e1: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
  const e2: Vec3 = [p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]]
  const du1 = t1[0] - t0[0]
  const dv1 = t1[1] - t0[1]
  const du2 = t3[0] - t0[0]
  const dv2 = t3[1] - t0[1]
  const det = du1 * dv2 - du2 * dv1
  if (Math.abs(det) < 1e-9) return null
  // [e1 e2] = [U V] · [[du1 du2] [dv1 dv2]]  →  [U V] = [e1 e2] · inverse
  const U: Vec3 = [0, 1, 2].map((c) => (e1[c]! * dv2 - e2[c]! * dv1) / det) as Vec3
  const V: Vec3 = [0, 1, 2].map((c) => (e2[c]! * du1 - e1[c]! * du2) / det) as Vec3
  const right = axis(U)
  const down = axis(V)
  return right && down ? { right, down } : null
}

const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]
const key = (p: Vec3): string => p.join(',')

/** Neighbour mask (ctm.ts bits) of the face `quad` of the block at `at`. */
export function faceMask(quad: Quad, at: Vec3, isSame: (p: Vec3) => boolean): number | null {
  const axes = faceAxes(quad)
  const normal = axis(quad.normal)
  if (!axes || !normal) return null
  const { right, down } = axes
  const connects = (dx: number, dy: number): boolean => {
    const neighbour = add(add(at, right, dx), down, dy)
    return isSame(neighbour) && !isSame(add(neighbour, normal))
  }
  let mask = 0
  if (connects(-1, 0)) mask |= LEFT
  if (connects(1, 0)) mask |= RIGHT
  if (connects(0, -1)) mask |= UP
  if (connects(0, 1)) mask |= DOWN
  if (connects(-1, -1)) mask |= UP_LEFT
  if (connects(1, -1)) mask |= UP_RIGHT
  if (connects(-1, 1)) mask |= DOWN_LEFT
  if (connects(1, 1)) mask |= DOWN_RIGHT
  return mask
}

export function tileFor(method: PreviewMethod, mask: number): number {
  return method === 'ctm'
    ? ctmTile(mask)
    : method === 'horizontal'
      ? horizontalTile(mask)
      : verticalTile(mask)
}

/** The quad keeps its own texture (not axis-aligned). */
export const OWN_TEXTURE = -1
/** The quad is hidden: it lies on the block's side and faces a block of the same kind. */
export const CULLED = -2

/** The quad lies on the block's boundary on the side its normal points to (a cullable face). */
function onBoundary(quad: Quad, normal: Vec3): boolean {
  const i = normal.findIndex((v) => v !== 0)
  const edge = normal[i]! > 0 ? 16 : 0
  return quad.positions.every((p) => Math.abs(p[i]! - edge) < 1e-6)
}

/**
 * For every position, the tile of each quad (index into `quads`), OWN_TEXTURE, or CULLED: like the
 * game, a face against a block of the same kind is not drawn (glass next to glass), which also
 * keeps hidden frames from showing through transparent blocks.
 */
export function assignTiles(
  positions: readonly Vec3[],
  quads: readonly Quad[],
  method: PreviewMethod
): number[][] {
  const occupied = new Set(positions.map(key))
  const isSame = (p: Vec3): boolean => occupied.has(key(p))
  return positions.map((at) =>
    quads.map((quad) => {
      const normal = axis(quad.normal)
      if (normal && onBoundary(quad, normal) && isSame(add(at, normal))) return CULLED
      const mask = faceMask(quad, at, isSame)
      return mask === null ? OWN_TEXTURE : tileFor(method, mask)
    })
  )
}

/**
 * The CTM set of a texture among parsed `.properties` files: tile-based files whose matchTiles
 * (or file name) is the texture's short name, then block-based ones for `block`; the first in
 * alphabetical order wins (as OptiFine). `null` reason when none applies.
 */
export function findCtmSet(
  files: ReadonlyArray<{ path: string; properties: Properties }>,
  texturePath: string,
  block: string | null
): { set: CtmSet } | { set: null; reason: string | null } {
  const short = texturePath.replace(/^.*\//, '').replace(/\.png$/, '')
  const blockName = block?.replace(/^minecraft:/, '') ?? null
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const name = (path: string): string => path.replace(/^.*\//, '').replace(/\.properties$/, '')
  const byTile = sorted.filter(({ path, properties }) => {
    const tiles = properties.get('matchTiles')
    const list =
      tiles !== undefined
        ? tiles.split(/\s+/)
        : properties.get('matchBlocks') === undefined && !name(path).startsWith('block_')
          ? [name(path)]
          : []
    return list.some((t) => t === short || t.replace(/^minecraft:(block\/)?/, '') === short)
  })
  const byBlock = blockName
    ? sorted.filter(({ path, properties }) => {
        const blocks = properties.get('matchBlocks')
        const list =
          blocks !== undefined
            ? blocks.split(/\s+/)
            : name(path).startsWith('block_')
              ? [name(path).slice(6)]
              : []
        return list.some((b) => b.replace(/^minecraft:/, '').split(':')[0] === blockName)
      })
    : []
  const found = byTile[0] ?? byBlock[0]
  if (!found) return { set: null, reason: null }
  const method = (found.properties.get('method') ?? 'ctm') as CtmMethod
  if (method !== 'ctm' && method !== 'horizontal' && method !== 'vertical') {
    return {
      set: null,
      reason: tr(
        '{0}.properties usa il metodo «{1}»: l’anteprima mostra solo ctm, horizontal e vertical.',
        name(found.path),
        method
      )
    }
  }
  const expected = method === 'ctm' ? 47 : 4
  const declared = expandTiles(found.properties.get('tiles') ?? '').length
  if (declared < expected) {
    return {
      set: null,
      reason: tr(
        '{0}.properties elenca {1} tile, il metodo «{2}» ne usa {3}.',
        name(found.path),
        declared,
        method,
        expected
      )
    }
  }
  const dir = found.path.slice(0, found.path.lastIndexOf('/'))
  const root = found.path.replace(/optifine\/ctm\/.*$/, '')
  const tiles = expandTiles(found.properties.get('tiles') ?? '').map((tile) =>
    tile.includes('/') ? `${root}${tile.replace(/^\.\//, '')}` : `${dir}/${tile}`
  )
  return { set: { path: found.path, method, tiles } }
}
