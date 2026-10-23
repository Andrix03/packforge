// What a block/item model JSON may contain, per resource pack format, and what it costs.
// Research 2026-10-22: minecraft.wiki version pages, checked against
// the 26.3 client (CuboidModelElement / CuboidFace deserializers, read with javap). Pure.
//
// A model is checked against the range of formats the pack targets: something that makes the
// game reject the model in one of those versions is an error (the block shows the missing
// model), something an older or newer version silently ignores is a warning.

import { comparePackVersions, GAME_RELEASES, type PackVersion } from './packFormat'

export type ModelSeverity = 'error' | 'warning' | 'info'

export interface ModelIssue {
  severity: ModelSeverity
  /** Index in `elements`, or null for the whole model. */
  element: number | null
  message: string
}

export interface FormatRange {
  min: PackVersion
  max: PackVersion
}

/** First resource pack format of each model feature (snapshot formats where the wiki gives them). */
export const MODEL_FEATURES = {
  /** 24w33a: `light_emission` on elements. */
  lightEmission: { major: 42, minor: 0 },
  /** 25w16a: element angles anywhere in −45…45 (before: 0, ±22.5, ±45 only). */
  freeAngles: { major: 57, minor: 0 },
  /** 25w33a: the `on_shelf` display context. */
  onShelf: { major: 69, minor: 0 },
  /** 25w46a: rotation {x, y, z} on several axes, any angle. */
  multiAxis: { major: 74, minor: 0 },
  /** 26.1 snapshot 7: texture values {sprite, force_translucent}. */
  textureObjects: { major: 84, minor: 0 },
  /** 26.3 snapshot 3: `shade` removed, `shade_direction_override` added. */
  shadeOverride: { major: 91, minor: 0 }
} as const satisfies Record<string, PackVersion>

/** Faces of the heaviest vanilla 26.3 block model (mangrove propagule, cauldron: 58–60). */
export const VANILLA_MAX_FACES = 60

const DIRECTIONS = new Set(['down', 'up', 'north', 'south', 'west', 'east'])
const DISPLAY_CONTEXTS = new Set([
  'thirdperson_righthand',
  'thirdperson_lefthand',
  'firstperson_righthand',
  'firstperson_lefthand',
  'gui',
  'head',
  'ground',
  'fixed',
  'on_shelf'
])
const OLD_ANGLES = new Set([0, 22.5, -22.5, 45, -45])

export interface ModelCost {
  elements: number
  faces: number
}

/** Elements and faces drawn by the model's own `elements` (parents not followed). */
export function modelCost(json: unknown): ModelCost {
  const elements = isRecord(json) && Array.isArray(json['elements']) ? json['elements'] : []
  let faces = 0
  for (const element of elements) {
    if (isRecord(element) && isRecord(element['faces'])) {
      faces += Object.keys(element['faces']).length
    }
  }
  return { elements: elements.length, faces }
}

/** Problems of a model JSON for packs that target `range`. Empty = fine everywhere. */
export function checkModel(json: unknown, range: FormatRange): ModelIssue[] {
  const issues: ModelIssue[] = []
  const add = (severity: ModelSeverity, element: number | null, message: string): void => {
    issues.push({ severity, element, message })
  }
  if (!isRecord(json)) {
    add('error', null, 'Il modello non è un oggetto JSON.')
    return issues
  }
  /** The feature is missing in the oldest targeted version. */
  const tooOld = (feature: PackVersion): boolean => comparePackVersions(range.min, feature) < 0
  /** The newest targeted version already has it. */
  const reaches = (feature: PackVersion): boolean => comparePackVersions(range.max, feature) >= 0
  const since = (feature: PackVersion): string => `dalla ${firstRelease(feature)}`

  checkTextures(json['textures'], tooOld(MODEL_FEATURES.textureObjects), since, add)
  checkDisplay(json['display'], tooOld(MODEL_FEATURES.onShelf), since, add)

  const elements = json['elements']
  if (elements !== undefined && !Array.isArray(elements)) {
    add('error', null, '"elements" deve essere una lista.')
  }
  for (const [index, element] of (Array.isArray(elements) ? elements : []).entries()) {
    if (!isRecord(element)) {
      add('error', index, 'L’elemento non è un oggetto.')
      continue
    }
    for (const key of ['from', 'to'] as const) {
      const value = element[key]
      if (!isVec3(value)) add('error', index, `"${key}" deve essere [x, y, z].`)
      else if (value.some((v) => v < -16 || v > 32)) {
        add('error', index, `"${key}" esce dai limiti da -16 a 32: il gioco scarta il modello.`)
      }
    }
    checkRotation(element['rotation'], index, tooOld, since, add)
    checkFaces(element['faces'], index, add)

    const light = element['light_emission']
    if (light !== undefined) {
      if (!Number.isInteger(light) || (light as number) < 0 || (light as number) > 15) {
        add('error', index, '"light_emission" deve essere un intero da 0 a 15.')
      } else if (tooOld(MODEL_FEATURES.lightEmission)) {
        add(
          'warning',
          index,
          `"light_emission" funziona ${since(MODEL_FEATURES.lightEmission)}: prima è ignorato.`
        )
      }
    }

    const shade = element['shade']
    const override = element['shade_direction_override']
    if (override !== undefined) {
      if (typeof override !== 'string' || !DIRECTIONS.has(override)) {
        add(
          'error',
          index,
          '"shade_direction_override" deve essere una direzione (up, down, north…).'
        )
      } else if (tooOld(MODEL_FEATURES.shadeOverride) && shade === undefined) {
        add(
          'warning',
          index,
          `"shade_direction_override" esiste ${since(MODEL_FEATURES.shadeOverride)}: per le versioni prima aggiungi "shade": false.`
        )
      }
    }
    if (shade !== undefined) {
      if (typeof shade !== 'boolean') add('error', index, '"shade" deve essere true o false.')
      else if (shade === false && reaches(MODEL_FEATURES.shadeOverride) && override === undefined) {
        add(
          'warning',
          index,
          `"shade": false è ignorato ${since(MODEL_FEATURES.shadeOverride)}: aggiungi "shade_direction_override": "up".`
        )
      }
    }
  }

  const cost = modelCost(json)
  if (cost.faces > VANILLA_MAX_FACES) {
    add(
      'info',
      null,
      `${cost.faces} facce: più di qualsiasi blocco vanilla (massimo ${VANILLA_MAX_FACES}). Usato in tanti blocchi pesa sulle prestazioni.`
    )
  }
  return issues
}

function checkRotation(
  rotation: unknown,
  index: number,
  tooOld: (feature: PackVersion) => boolean,
  since: (feature: PackVersion) => string,
  add: (severity: ModelSeverity, element: number | null, message: string) => void
): void {
  if (rotation === undefined) return
  if (!isRecord(rotation)) {
    add('error', index, '"rotation" deve essere un oggetto.')
    return
  }
  if (!isVec3(rotation['origin'])) add('error', index, 'La rotazione richiede "origin": [x, y, z].')
  const single = rotation['axis'] !== undefined || rotation['angle'] !== undefined
  if (single) {
    // The game reads axis + angle first when both forms are present.
    const { axis, angle } = rotation
    if (axis !== 'x' && axis !== 'y' && axis !== 'z') {
      add('error', index, 'L’asse di rotazione deve essere "x", "y" o "z".')
    }
    if (typeof angle !== 'number' || !Number.isFinite(angle)) {
      add('error', index, 'L’angolo di rotazione deve essere un numero.')
      return
    }
    if (Math.abs(angle) > 45 && tooOld(MODEL_FEATURES.multiAxis)) {
      add(
        'error',
        index,
        `Angolo ${angle}°: oltre ±45° funziona solo ${since(MODEL_FEATURES.multiAxis)}, prima il modello viene scartato.`
      )
    } else if (!OLD_ANGLES.has(angle) && tooOld(MODEL_FEATURES.freeAngles)) {
      add(
        'error',
        index,
        `Angolo ${angle}°: prima della ${firstRelease(MODEL_FEATURES.freeAngles)} sono ammessi solo 0, ±22,5 e ±45.`
      )
    }
    return
  }
  const axes = ['x', 'y', 'z'] as const
  if (axes.every((a) => rotation[a] === undefined)) {
    add('error', index, 'La rotazione richiede "axis" e "angle" (o "x", "y", "z").')
    return
  }
  if (axes.some((a) => rotation[a] !== undefined && typeof rotation[a] !== 'number')) {
    add('error', index, 'Gli angoli "x", "y", "z" devono essere numeri.')
  }
  if (tooOld(MODEL_FEATURES.multiAxis)) {
    add(
      'error',
      index,
      `Rotazione su più assi (x, y, z): funziona ${since(MODEL_FEATURES.multiAxis)}, prima il modello viene scartato.`
    )
  }
}

function checkFaces(
  faces: unknown,
  index: number,
  add: (severity: ModelSeverity, element: number | null, message: string) => void
): void {
  if (!isRecord(faces) || Object.keys(faces).length === 0) {
    add('error', index, 'Ogni elemento deve avere da 1 a 6 facce: il gioco scarta il modello.')
    return
  }
  for (const [name, face] of Object.entries(faces)) {
    if (!DIRECTIONS.has(name)) {
      add('error', index, `Faccia "${name}" sconosciuta (down, up, north, south, west, east).`)
      continue
    }
    if (!isRecord(face) || typeof face['texture'] !== 'string') {
      add('error', index, `La faccia ${name} richiede "texture".`)
      continue
    }
    const rotation = face['rotation']
    if (rotation !== undefined && ![0, 90, 180, 270].includes(rotation as number)) {
      add('error', index, `Faccia ${name}: la rotazione deve essere 0, 90, 180 o 270.`)
    }
    const uv = face['uv']
    if (uv !== undefined) {
      if (!Array.isArray(uv) || uv.length !== 4 || !uv.every((v) => typeof v === 'number')) {
        add('error', index, `Faccia ${name}: "uv" deve essere [x1, y1, x2, y2].`)
      } else if (uv.some((v: number) => v < 0 || v > 16)) {
        add('warning', index, `Faccia ${name}: UV fuori da 0…16, il risultato non è affidabile.`)
      }
    }
    const cull = face['cullface']
    if (cull !== undefined && (typeof cull !== 'string' || !DIRECTIONS.has(cull))) {
      add('error', index, `Faccia ${name}: "cullface" deve essere una direzione.`)
    }
  }
}

function checkTextures(
  textures: unknown,
  objectsTooOld: boolean,
  since: (feature: PackVersion) => string,
  add: (severity: ModelSeverity, element: number | null, message: string) => void
): void {
  if (textures === undefined) return
  if (!isRecord(textures)) {
    add('error', null, '"textures" deve essere un oggetto.')
    return
  }
  for (const [name, value] of Object.entries(textures)) {
    if (typeof value === 'string') continue
    if (isRecord(value) && typeof value['sprite'] === 'string') {
      if (objectsTooOld) {
        add(
          'error',
          null,
          `Texture "${name}" scritta come {"sprite": …}: funziona ${since(MODEL_FEATURES.textureObjects)}.`
        )
      }
      continue
    }
    add('error', null, `Texture "${name}": deve essere un id o "#variabile".`)
  }
}

function checkDisplay(
  display: unknown,
  onShelfTooOld: boolean,
  since: (feature: PackVersion) => string,
  add: (severity: ModelSeverity, element: number | null, message: string) => void
): void {
  if (display === undefined) return
  if (!isRecord(display)) {
    add('error', null, '"display" deve essere un oggetto.')
    return
  }
  for (const [context, transform] of Object.entries(display)) {
    if (!DISPLAY_CONTEXTS.has(context)) {
      add('warning', null, `Vista "${context}" sconosciuta: il gioco la ignora.`)
      continue
    }
    if (context === 'on_shelf' && onShelfTooOld) {
      add(
        'info',
        null,
        `La vista "on_shelf" esiste ${since(MODEL_FEATURES.onShelf)}: prima è ignorata.`
      )
    }
    if (!isRecord(transform)) continue
    const translation = transform['translation']
    if (isVec3(translation) && translation.some((v) => Math.abs(v) > 80)) {
      add('warning', null, `Vista ${context}: lo spostamento oltre ±80 viene tagliato a 80.`)
    }
    const scale = transform['scale']
    if (isVec3(scale) && scale.some((v) => v > 4)) {
      add('warning', null, `Vista ${context}: la scala oltre 4 viene mostrata come 4.`)
    }
  }
}

/** The oldest supported release whose format has `feature` (e.g. "1.21.11"). */
export function firstRelease(feature: PackVersion): string {
  const oldestFirst = [...GAME_RELEASES].reverse()
  return (
    oldestFirst.find((release) => comparePackVersions(release.resourceFormat, feature) >= 0)
      ?.version ?? 'una versione futura'
  )
}

function isVec3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
