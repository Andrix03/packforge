// The humanoid armor model for the 3D preview of an equipment texture (64×32): which boxes the game
// draws for a layer, where, how much bigger than the body, and which part of the texture each face
// shows. Checked on the 26.3 client (HumanoidModel.createMesh, LayerDefinitions: outer armor
// deformation 1.0, inner 0.5; the hat adds 0.5 to the head). Pure.
import { boxFaces, type UvRect } from './equipment'

export type ArmorLayer = 'humanoid' | 'humanoid_leggings'

export type BoxFace = 'top' | 'bottom' | 'right' | 'front' | 'left' | 'back'

export interface ArmorBox {
  part: string
  /** Lower corner in model pixels: x to the wearer's left, y up from the feet, z forward. */
  from: [number, number, number]
  size: [number, number, number]
  /** How much bigger than the body on every side (the game's CubeDeformation). */
  inflate: number
  /** Texture rectangle (pixels of the 64×32 texture) of each face. */
  faces: Record<BoxFace, UvRect>
  /** Left limbs reuse the right ones' texture, mirrored. */
  mirror: boolean
}

/** The equipment layer a texture path belongs to, or null. */
export function armorLayerOf(path: string): ArmorLayer | null {
  const m =
    /^assets\/[^/]+\/textures\/entity\/equipment\/(humanoid|humanoid_leggings)\/[^/]+\.png$/.exec(
      path
    )
  return m ? (m[1] as ArmorLayer) : null
}

const OUTER = 1
const INNER = 0.5
/** The hat is the head grown by another half pixel. */
const HAT = 0.5

/**
 * The boxes the game draws for a layer: the outer one (helmet, chestplate, boots) shows every
 * part; the leggings layer the body and the legs.
 */
export function armorBoxes(layer: ArmorLayer): ArmorBox[] {
  const inflate = layer === 'humanoid' ? OUTER : INNER
  const box = (
    part: string,
    from: [number, number, number],
    size: [number, number, number],
    uv: [number, number],
    extra = 0,
    mirror = false
  ): ArmorBox => ({
    part,
    from,
    size,
    inflate: inflate + extra,
    faces: boxFaces(uv[0], uv[1], size[0], size[1], size[2]) as Record<BoxFace, UvRect>,
    mirror
  })
  // The classic player, feet at y 0: legs 0–12, body 12–24, head 24–32, arms at the shoulders.
  const legs = [
    box('right_leg', [-4, 0, -2], [4, 12, 4], [0, 16]),
    box('left_leg', [0, 0, -2], [4, 12, 4], [0, 16], 0, true)
  ]
  const body = box('body', [-4, 12, -2], [8, 12, 4], [16, 16])
  if (layer === 'humanoid_leggings') return [body, ...legs]
  return [
    box('head', [-4, 24, -4], [8, 8, 8], [0, 0]),
    box('hat', [-4, 24, -4], [8, 8, 8], [32, 0], HAT),
    body,
    box('right_arm', [-8, 12, -2], [4, 12, 4], [40, 16]),
    box('left_arm', [4, 12, -2], [4, 12, 4], [40, 16], 0, true),
    ...legs
  ]
}

/** The other layer of the same armor (`humanoid/iron.png` ↔ `humanoid_leggings/iron.png`). */
export function companionLayerPath(path: string): string | null {
  const layer = armorLayerOf(path)
  if (!layer) return null
  const other = layer === 'humanoid' ? 'humanoid_leggings' : 'humanoid'
  return path.replace(`/equipment/${layer}/`, `/equipment/${other}/`)
}

/** Leather armor is painted grey and tinted with its dye; undyed it gets this brown. */
export const LEATHER_DEFAULT_COLOR = 0xa06540

/** True for the dyeable leather texture (not its untinted `_overlay`). */
export function isDyeableArmor(path: string): boolean {
  return armorLayerOf(path) !== null && /\/leather\.png$/.test(path)
}

export interface BoxMesh {
  /** x, y, z per vertex, 4 vertices per face. */
  positions: number[]
  /** u, v per vertex, 0–1 with v = 0 at the top of the texture. */
  uvs: number[]
  /** Two triangles per face, counter-clockwise seen from outside. */
  indices: number[]
}

/**
 * The triangles of a box with its faces mapped like the game's ModelPart.Cube (on a texture
 * `textureWidth`×`textureHeight` in model pixels). Seen from outside every face reads the right
 * way round; a mirrored box swaps its left and right faces and flips them all horizontally.
 */
export function boxMesh(box: ArmorBox, textureWidth = 64, textureHeight = 32): BoxMesh {
  const g = box.inflate
  const [x0, y0, z0] = [box.from[0] - g, box.from[1] - g, box.from[2] - g]
  const [x1, y1, z1] = [
    box.from[0] + box.size[0] + g,
    box.from[1] + box.size[1] + g,
    box.from[2] + box.size[2] + g
  ]
  type V = [number, number, number]
  // Corners bottom-left, bottom-right, top-right, top-left as seen from outside the face. The
  // wearer faces +z, so their right side is -x; the top shows the front at its lower edge, the
  // bottom at its upper edge (the game flips it).
  const corners: Record<BoxFace, [V, V, V, V]> = {
    front: [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1]
    ],
    back: [
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0]
    ],
    right: [
      [x0, y0, z0],
      [x0, y0, z1],
      [x0, y1, z1],
      [x0, y1, z0]
    ],
    left: [
      [x1, y0, z1],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1]
    ],
    top: [
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0]
    ],
    bottom: [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1]
    ]
  }
  const mesh: BoxMesh = { positions: [], uvs: [], indices: [] }
  for (const face of Object.keys(corners) as BoxFace[]) {
    const source =
      box.mirror && face === 'left' ? 'right' : box.mirror && face === 'right' ? 'left' : face
    const rect = box.faces[source]
    let u0 = rect.x / textureWidth
    let u1 = (rect.x + rect.width) / textureWidth
    if (box.mirror) [u0, u1] = [u1, u0]
    const vTop = rect.y / textureHeight
    const vBottom = (rect.y + rect.height) / textureHeight
    const base = mesh.positions.length / 3
    for (const corner of corners[face]) mesh.positions.push(...corner)
    mesh.uvs.push(u0, vBottom, u1, vBottom, u1, vTop, u0, vTop)
    mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  return mesh
}
