import { faceCorners, type Quad, type Vec2 } from './blockGeometry'
import type { Direction, TextureRef, Vec3 } from './blockModel'

// The game's "generated" item model (item/generated): the sprite as a 1/16 block thick plate,
// front and back faces plus a side face on every edge between an opaque and a transparent pixel
// (or the border). Coordinates in block space (0–16), the plate centered on z = 8.

const Z_FROM = 7.5
const Z_TO = 8.5

/**
 * Quads of an item sprite of `width`×`height` pixels; `opaque(x, y)` (origin top-left) tells
 * which pixels are drawn. Side faces sample their own pixel, so their UVs collapse on its center.
 */
export function itemQuads(
  width: number,
  height: number,
  opaque: (x: number, y: number) => boolean,
  texture: TextureRef | null
): Quad[] {
  const quad = (direction: Direction, from: Vec3, to: Vec3, uvs: Quad['uvs']): Quad => ({
    positions: faceCorners(direction, from, to),
    uvs,
    normal: NORMALS[direction],
    texture,
    tintIndex: -1
  })
  const quads: Quad[] = [
    quad(
      'south',
      [0, 0, Z_FROM],
      [16, 16, Z_TO],
      [
        [0, 0],
        [16, 0],
        [16, 16],
        [0, 16]
      ]
    ),
    // Seen from the back the sprite is mirrored: the corner at x = 16 is on the left.
    quad(
      'north',
      [0, 0, Z_FROM],
      [16, 16, Z_TO],
      [
        [16, 0],
        [0, 0],
        [0, 16],
        [16, 16]
      ]
    )
  ]
  const sx = 16 / width
  const sy = 16 / height
  const isOpaque = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && opaque(x, y)
  const sides: Array<[Direction, number, number]> = [
    ['up', 0, -1],
    ['down', 0, 1],
    ['west', -1, 0],
    ['east', 1, 0]
  ]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue
      // Pixel box, y flipped (texture rows go down, block Y goes up).
      const from: Vec3 = [x * sx, 16 - (y + 1) * sy, Z_FROM]
      const to: Vec3 = [(x + 1) * sx, 16 - y * sy, Z_TO]
      const center: Vec2 = [(x + 0.5) * sx, (y + 0.5) * sy]
      for (const [direction, dx, dy] of sides) {
        if (isOpaque(x + dx, y + dy)) continue
        quads.push(quad(direction, from, to, [center, center, center, center]))
      }
    }
  }
  return quads
}

const NORMALS: Record<Direction, Vec3> = {
  down: [0, -1, 0],
  up: [0, 1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  west: [-1, 0, 0],
  east: [1, 0, 0]
}

/** A model "display" transform (item/generated.json → display.firstperson_righthand…). */
export interface DisplayTransform {
  /** Degrees around X, Y, Z. */
  rotation: Vec3
  /** In 1/16 block. */
  translation: Vec3
  scale: Vec3
}

/** Fallback when the model can't be read: item/generated, first person right hand. */
export const FIRST_PERSON_RIGHT: DisplayTransform = {
  rotation: [0, -90, 25],
  translation: [1.13, 3.2, 1.13],
  scale: [0.68, 0.68, 0.68]
}

/**
 * Reads `display.<slot>` from a model JSON (vanilla limits: translation ±80, scale ≤ 4).
 * Returns null when the model has no such entry.
 */
export function readDisplay(model: unknown, slot: string): DisplayTransform | null {
  if (!isRecord(model) || !isRecord(model['display'])) return null
  const entry = model['display'][slot]
  if (!isRecord(entry)) return null
  const vec = (value: unknown, fallback: Vec3, limit: number): Vec3 =>
    Array.isArray(value) && value.length === 3 && value.every((c) => typeof c === 'number')
      ? (value.map((c: number) => Math.max(-limit, Math.min(limit, c))) as Vec3)
      : fallback
  return {
    rotation: vec(entry['rotation'], [0, 0, 0], 360),
    translation: vec(entry['translation'], [0, 0, 0], 80),
    scale: vec(entry['scale'], [1, 1, 1], 4)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
