import type {
  BlockModelRef,
  Direction,
  ModelElement,
  ResolvedModel,
  TextureRef,
  Vec3
} from './blockModel'

// Turns resolved model elements into textured quads in block space (0–16).
// Conventions (Minecraft): +X east, +Y up, +Z south. UVs are texture pixels
// with v growing downwards. Face corners are listed top-left, top-right,
// bottom-right, bottom-left as seen from outside the face; UV corners map in
// the same order.

export type Vec2 = [number, number]

export interface Quad {
  positions: [Vec3, Vec3, Vec3, Vec3]
  uvs: [Vec2, Vec2, Vec2, Vec2]
  normal: Vec3
  texture: TextureRef | null
  tintIndex: number
  /** Face of a zero-thickness element (crop, flower and cross planes): drawn without POM. */
  thin?: boolean
}

/** Corners of a face (TL, TR, BR, BL from outside) for an element box. */
export function faceCorners(direction: Direction, from: Vec3, to: Vec3): [Vec3, Vec3, Vec3, Vec3] {
  const [x1, y1, z1] = from
  const [x2, y2, z2] = to
  switch (direction) {
    case 'north': // -Z, seen from the north: +X is on the left.
      return [
        [x2, y2, z1],
        [x1, y2, z1],
        [x1, y1, z1],
        [x2, y1, z1]
      ]
    case 'south': // +Z: +X on the right.
      return [
        [x1, y2, z2],
        [x2, y2, z2],
        [x2, y1, z2],
        [x1, y1, z2]
      ]
    case 'east': // +X: +Z on the left.
      return [
        [x2, y2, z2],
        [x2, y2, z1],
        [x2, y1, z1],
        [x2, y1, z2]
      ]
    case 'west': // -X: +Z on the right.
      return [
        [x1, y2, z1],
        [x1, y2, z2],
        [x1, y1, z2],
        [x1, y1, z1]
      ]
    case 'up': // +Y from above: north at the top.
      return [
        [x1, y2, z1],
        [x2, y2, z1],
        [x2, y2, z2],
        [x1, y2, z2]
      ]
    case 'down': // -Y from below: south at the top.
      return [
        [x1, y1, z2],
        [x2, y1, z2],
        [x2, y1, z1],
        [x1, y1, z1]
      ]
  }
}

/**
 * UV used when a face has none: the element's extent projected on the face,
 * consistent with `faceCorners` (a full-block face gets [0, 0, 16, 16]).
 */
export function defaultUv(
  direction: Direction,
  from: Vec3,
  to: Vec3
): [number, number, number, number] {
  const [x1, y1, z1] = from
  const [x2, y2, z2] = to
  switch (direction) {
    case 'north':
      return [16 - x2, 16 - y2, 16 - x1, 16 - y1]
    case 'south':
      return [x1, 16 - y2, x2, 16 - y1]
    case 'east':
      return [16 - z2, 16 - y2, 16 - z1, 16 - y1]
    case 'west':
      return [z1, 16 - y2, z2, 16 - y1]
    case 'up':
      return [x1, z1, x2, z2]
    case 'down':
      return [x1, 16 - z2, x2, 16 - z1]
  }
}

const NORMALS: Record<Direction, Vec3> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0]
}

/** Builds the quads of a model placed with a block-state rotation. */
export function buildQuads(
  model: ResolvedModel,
  placement: Pick<BlockModelRef, 'x' | 'y'>
): Quad[] {
  const quads: Quad[] = []
  for (const element of model.elements) {
    const thin = element.from.some((v, axis) => v === element.to[axis])
    for (const [direction, face] of Object.entries(element.faces) as Array<
      [Direction, NonNullable<ModelElement['faces'][Direction]>]
    >) {
      const corners = faceCorners(direction, element.from, element.to)
      const [u1, v1, u2, v2] = face.uv ?? defaultUv(direction, element.from, element.to)
      const uvCorners: Vec2[] = [
        [u1, v1],
        [u2, v1],
        [u2, v2],
        [u1, v2]
      ]
      // Face rotation turns the texture clockwise: vertex j shows UV corner j - k.
      const k = face.rotation / 90
      const uvs = corners.map((_, j) => uvCorners[(j - k + 4) % 4] as Vec2) as Quad['uvs']

      let positions = corners.map((p) => transformElement(p, element)) as Quad['positions']
      let normal = transformElement(NORMALS[direction], element, true)
      positions = positions.map((p) => rotateBlock(p, placement)) as Quad['positions']
      normal = rotateBlock(normal, placement, true)
      quads.push({
        positions,
        uvs,
        normal: normalize(normal),
        texture: face.texture,
        tintIndex: face.tintIndex,
        ...(thin ? { thin } : {})
      })
    }
  }
  return quads
}

/**
 * Directions on a quad in which its texture's u grows (right in the image) and v grows (down, image
 * rows): the tangent frame of LabPBR normal maps (DirectX convention, green = down).
 * Faces whose UVs are degenerate (zero width or height) fall back to the quad's own edges.
 */
export function textureAxes(quad: Pick<Quad, 'positions' | 'uvs' | 'normal'>): {
  right: Vec3
  down: Vec3
} {
  const [p0, p1, , p3] = quad.positions
  const [t0, t1, , t3] = quad.uvs
  const e1 = sub(p1, p0)
  const e2 = sub(p3, p0)
  const du1 = t1[0] - t0[0]
  const dv1 = t1[1] - t0[1]
  const du2 = t3[0] - t0[0]
  const dv2 = t3[1] - t0[1]
  const det = du1 * dv2 - du2 * dv1
  if (Math.abs(det) < 1e-9) {
    const right = normalize(e1)
    return { right, down: normalize(cross(right, quad.normal)) }
  }
  const right = e1.map((v, i) => (v * dv2 - e2[i]! * dv1) / det) as Vec3
  const down = e2.map((v, i) => (v * du1 - e1[i]! * du2) / det) as Vec3
  return { right: normalize(right), down: normalize(down) }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** Element rotation around its origin (right-hand rule, degrees), with rescale. */
function transformElement(point: Vec3, element: ModelElement, isDirection = false): Vec3 {
  const rotation = element.rotation
  if (!rotation) return point
  let p: Vec3 = isDirection ? point : sub(point, rotation.origin)
  for (const { axis, angle } of rotation.axes) {
    if (rotation.rescale && !isDirection && rotation.axes.length === 1) {
      // Stretch across the rotation plane so rotated faces keep the block size.
      const factor = 1 / Math.cos((Math.abs(angle) * Math.PI) / 180)
      p = p.map((v, i) => (i === axisIndex(axis) ? v : v * factor)) as Vec3
    }
    p = rotateAxis(p, axis, angle)
  }
  return isDirection ? p : add(p, rotation.origin)
}

/**
 * Block-state rotation around the block center in 90° steps. In Minecraft,
 * y: 90 turns north into east (clockwise seen from above): that is a negative
 * right-hand angle, and x uses the same sign convention.
 */
function rotateBlock(
  point: Vec3,
  placement: Pick<BlockModelRef, 'x' | 'y'>,
  isDirection = false
): Vec3 {
  if (placement.x === 0 && placement.y === 0) return point
  const center: Vec3 = [8, 8, 8]
  let p = isDirection ? point : sub(point, center)
  if (placement.x !== 0) p = rotateAxis(p, 'x', -placement.x)
  if (placement.y !== 0) p = rotateAxis(p, 'y', -placement.y)
  return isDirection ? p : add(p, center)
}

function rotateAxis(p: Vec3, axis: 'x' | 'y' | 'z', degrees: number): Vec3 {
  const a = (degrees * Math.PI) / 180
  // Snap exact quarter turns so axis-aligned results stay exact.
  const c = round(Math.cos(a))
  const s = round(Math.sin(a))
  const [x, y, z] = p
  switch (axis) {
    case 'x':
      return [x, y * c - z * s, y * s + z * c]
    case 'y':
      return [x * c + z * s, y, -x * s + z * c]
    case 'z':
      return [x * c - y * s, x * s + y * c, z]
  }
}

function round(v: number): number {
  return Math.abs(v) < 1e-12 ? 0 : Math.abs(Math.abs(v) - 1) < 1e-12 ? Math.sign(v) : v
}

function axisIndex(axis: 'x' | 'y' | 'z'): number {
  return axis === 'x' ? 0 : axis === 'y' ? 1 : 2
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(...v) || 1
  // `+ 0` turns -0 into 0.
  return [v[0] / length + 0, v[1] / length + 0, v[2] / length + 0]
}
