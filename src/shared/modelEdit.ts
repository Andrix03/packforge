// Helpers of the element editor (Phase 13): the model JSON being edited keeps every field it had;
// elements inherited from a parent are copied into it on the first edit (the child's own
// elements then replace the parent's, as the game reads them); new elements start as a full
// cube. Checks and costs come from shared/modelRules.ts. Pure.
import type { Direction } from './blockModel'
import { modelPath, namespaced, type JsonLoader } from './blockModel'

export type Vec3 = [number, number, number]

export interface EditFace {
  uv?: [number, number, number, number]
  texture: string
  cullface?: Direction
  rotation?: 0 | 90 | 180 | 270
  tintindex?: number
  [other: string]: unknown
}

export interface EditElement {
  from: Vec3
  to: Vec3
  rotation?: { origin: Vec3; axis: 'x' | 'y' | 'z'; angle: number; rescale?: boolean }
  faces: Partial<Record<Direction, EditFace>>
  [other: string]: unknown
}

export const FACE_ORDER: readonly Direction[] = ['north', 'south', 'east', 'west', 'up', 'down']

const MAX_DEPTH = 32

/**
 * What the editor starts from: the model's own JSON, with the elements it draws copied from the
 * nearest parent that has them when it has none itself; and the texture variables it can use
 * (its own and its parents', as `#name`).
 */
export async function editableModel(
  id: string,
  load: JsonLoader
): Promise<{ json: Record<string, unknown>; variables: string[]; inherited: boolean } | null> {
  const own = await load(modelPath(id))
  if (!isRecord(own)) return null
  const variables = new Set<string>()
  let elements: unknown = own['elements']
  let current: Record<string, unknown> | null = own
  const seen = new Set<string>([namespaced(id)])
  for (let depth = 0; current && depth < MAX_DEPTH; depth++) {
    if (isRecord(current['textures'])) {
      for (const key of Object.keys(current['textures'])) variables.add(`#${key}`)
    }
    if (elements === undefined && Array.isArray(current['elements'])) elements = current['elements']
    const parent = typeof current['parent'] === 'string' ? namespaced(current['parent']) : null
    if (!parent || parent.startsWith('minecraft:builtin/') || seen.has(parent)) break
    seen.add(parent)
    const next = await load(modelPath(parent))
    current = isRecord(next) ? next : null
  }
  const inherited = own['elements'] === undefined && Array.isArray(elements)
  return {
    json: {
      ...own,
      elements: Array.isArray(elements) ? (structuredClone(elements) as unknown[]) : []
    },
    variables: [...variables].filter((v) => v !== '#particle').sort(),
    inherited
  }
}

/** A new element: the full cube with `texture` (a `#variable`) on every face. */
export function cubeElement(texture: string): EditElement {
  return {
    from: [0, 0, 0],
    to: [16, 16, 16],
    faces: Object.fromEntries(FACE_ORDER.map((face) => [face, { texture }]))
  }
}

/** The model's elements as editable values (anything unreadable is dropped). */
export function elementsOf(json: Record<string, unknown>): EditElement[] {
  const list = Array.isArray(json['elements']) ? json['elements'] : []
  return list.filter(
    (e: unknown): e is EditElement =>
      isRecord(e) && isVec3(e['from']) && isVec3(e['to']) && isRecord(e['faces'])
  )
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
