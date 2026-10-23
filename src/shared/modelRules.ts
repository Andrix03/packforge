// What a block/item model JSON may contain, per resource pack format, and what it costs.
// Research 2026-10-22: minecraft.wiki version pages, checked against
// the 26.3 client (CuboidModelElement / CuboidFace deserializers, read with javap). Pure.
//
// A model is checked against the range of formats the pack targets: something that makes the
// game reject the model in one of those versions is an error (the block shows the missing
// model), something an older or newer version silently ignores is a warning.

import { comparePackVersions, GAME_RELEASES, type PackVersion } from './packFormat'
import { tr } from './i18n'

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
    add('error', null, tr('Il modello non è un oggetto JSON.'))
    return issues
  }
  /** The feature is missing in the oldest targeted version. */
  const tooOld = (feature: PackVersion): boolean => comparePackVersions(range.min, feature) < 0
  /** The newest targeted version already has it. */
  const reaches = (feature: PackVersion): boolean => comparePackVersions(range.max, feature) >= 0
  const since = (feature: PackVersion): string => tr('dalla {0}', firstRelease(feature))

  checkTextures(json['textures'], tooOld(MODEL_FEATURES.textureObjects), since, add)
  checkDisplay(json['display'], tooOld(MODEL_FEATURES.onShelf), since, add)

  const elements = json['elements']
  if (elements !== undefined && !Array.isArray(elements)) {
    add('error', null, tr('"elements" deve essere una lista.'))
  }
  for (const [index, element] of (Array.isArray(elements) ? elements : []).entries()) {
    if (!isRecord(element)) {
      add('error', index, tr('L’elemento non è un oggetto.'))
      continue
    }
    for (const key of ['from', 'to'] as const) {
      const value = element[key]
      if (!isVec3(value)) add('error', index, tr('"{0}" deve essere [x, y, z].', key))
      else if (value.some((v) => v < -16 || v > 32)) {
        add(
          'error',
          index,
          tr('"{0}" esce dai limiti da -16 a 32: il gioco scarta il modello.', key)
        )
      }
    }
    checkRotation(element['rotation'], index, tooOld, since, add)
    checkFaces(element['faces'], index, add)

    const light = element['light_emission']
    if (light !== undefined) {
      if (!Number.isInteger(light) || (light as number) < 0 || (light as number) > 15) {
        add('error', index, tr('"light_emission" deve essere un intero da 0 a 15.'))
      } else if (tooOld(MODEL_FEATURES.lightEmission)) {
        add(
          'warning',
          index,
          tr(
            '"light_emission" funziona {0}: prima è ignorato.',
            since(MODEL_FEATURES.lightEmission)
          )
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
          tr('"shade_direction_override" deve essere una direzione (up, down, north…).')
        )
      } else if (tooOld(MODEL_FEATURES.shadeOverride) && shade === undefined) {
        add(
          'warning',
          index,
          tr(
            '"shade_direction_override" esiste {0}: per le versioni prima aggiungi "shade": false.',
            since(MODEL_FEATURES.shadeOverride)
          )
        )
      }
    }
    if (shade !== undefined) {
      if (typeof shade !== 'boolean') add('error', index, tr('"shade" deve essere true o false.'))
      else if (shade === false && reaches(MODEL_FEATURES.shadeOverride) && override === undefined) {
        add(
          'warning',
          index,
          tr(
            '"shade": false è ignorato {0}: aggiungi "shade_direction_override": "up".',
            since(MODEL_FEATURES.shadeOverride)
          )
        )
      }
    }
  }

  const cost = modelCost(json)
  if (cost.faces > VANILLA_MAX_FACES) {
    add(
      'info',
      null,
      tr(
        '{0} facce: più di qualsiasi blocco vanilla (massimo {1}). Usato in tanti blocchi pesa sulle prestazioni.',
        cost.faces,
        VANILLA_MAX_FACES
      )
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
    add('error', index, tr('"rotation" deve essere un oggetto.'))
    return
  }
  if (!isVec3(rotation['origin']))
    add('error', index, tr('La rotazione richiede "origin": [x, y, z].'))
  const single = rotation['axis'] !== undefined || rotation['angle'] !== undefined
  if (single) {
    // The game reads axis + angle first when both forms are present.
    const { axis, angle } = rotation
    if (axis !== 'x' && axis !== 'y' && axis !== 'z') {
      add('error', index, tr('L’asse di rotazione deve essere "x", "y" o "z".'))
    }
    if (typeof angle !== 'number' || !Number.isFinite(angle)) {
      add('error', index, tr('L’angolo di rotazione deve essere un numero.'))
      return
    }
    if (Math.abs(angle) > 45 && tooOld(MODEL_FEATURES.multiAxis)) {
      add(
        'error',
        index,
        tr(
          'Angolo {0}°: oltre ±45° funziona solo {1}, prima il modello viene scartato.',
          angle,
          since(MODEL_FEATURES.multiAxis)
        )
      )
    } else if (!OLD_ANGLES.has(angle) && tooOld(MODEL_FEATURES.freeAngles)) {
      add(
        'error',
        index,
        tr(
          'Angolo {0}°: prima della {1} sono ammessi solo 0, ±22,5 e ±45.',
          angle,
          firstRelease(MODEL_FEATURES.freeAngles)
        )
      )
    }
    return
  }
  const axes = ['x', 'y', 'z'] as const
  if (axes.every((a) => rotation[a] === undefined)) {
    add('error', index, tr('La rotazione richiede "axis" e "angle" (o "x", "y", "z").'))
    return
  }
  if (axes.some((a) => rotation[a] !== undefined && typeof rotation[a] !== 'number')) {
    add('error', index, tr('Gli angoli "x", "y", "z" devono essere numeri.'))
  }
  if (tooOld(MODEL_FEATURES.multiAxis)) {
    add(
      'error',
      index,
      tr(
        'Rotazione su più assi (x, y, z): funziona {0}, prima il modello viene scartato.',
        since(MODEL_FEATURES.multiAxis)
      )
    )
  }
}

function checkFaces(
  faces: unknown,
  index: number,
  add: (severity: ModelSeverity, element: number | null, message: string) => void
): void {
  if (!isRecord(faces) || Object.keys(faces).length === 0) {
    add('error', index, tr('Ogni elemento deve avere da 1 a 6 facce: il gioco scarta il modello.'))
    return
  }
  for (const [name, face] of Object.entries(faces)) {
    if (!DIRECTIONS.has(name)) {
      add(
        'error',
        index,
        tr('Faccia "{0}" sconosciuta (down, up, north, south, west, east).', name)
      )
      continue
    }
    if (!isRecord(face) || typeof face['texture'] !== 'string') {
      add('error', index, tr('La faccia {0} richiede "texture".', name))
      continue
    }
    const rotation = face['rotation']
    if (rotation !== undefined && ![0, 90, 180, 270].includes(rotation as number)) {
      add('error', index, tr('Faccia {0}: la rotazione deve essere 0, 90, 180 o 270.', name))
    }
    const uv = face['uv']
    if (uv !== undefined) {
      if (!Array.isArray(uv) || uv.length !== 4 || !uv.every((v) => typeof v === 'number')) {
        add('error', index, tr('Faccia {0}: "uv" deve essere [x1, y1, x2, y2].', name))
      } else if (uv.some((v: number) => v < 0 || v > 16)) {
        add(
          'warning',
          index,
          tr('Faccia {0}: UV fuori da 0…16, il risultato non è affidabile.', name)
        )
      }
    }
    const cull = face['cullface']
    if (cull !== undefined && (typeof cull !== 'string' || !DIRECTIONS.has(cull))) {
      add('error', index, tr('Faccia {0}: "cullface" deve essere una direzione.', name))
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
    add('error', null, tr('"textures" deve essere un oggetto.'))
    return
  }
  for (const [name, value] of Object.entries(textures)) {
    if (typeof value === 'string') continue
    if (isRecord(value) && typeof value['sprite'] === 'string') {
      if (objectsTooOld) {
        add(
          'error',
          null,
          tr(
            'Texture "{0}" scritta come {"sprite": …}: funziona {1}.',
            name,
            since(MODEL_FEATURES.textureObjects)
          )
        )
      }
      continue
    }
    add('error', null, tr('Texture "{0}": deve essere un id o "#variabile".', name))
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
    add('error', null, tr('"display" deve essere un oggetto.'))
    return
  }
  for (const [context, transform] of Object.entries(display)) {
    if (!DISPLAY_CONTEXTS.has(context)) {
      add('warning', null, tr('Vista "{0}" sconosciuta: il gioco la ignora.', context))
      continue
    }
    if (context === 'on_shelf' && onShelfTooOld) {
      add(
        'info',
        null,
        tr('La vista "on_shelf" esiste {0}: prima è ignorata.', since(MODEL_FEATURES.onShelf))
      )
    }
    if (!isRecord(transform)) continue
    const translation = transform['translation']
    if (isVec3(translation) && translation.some((v) => Math.abs(v) > 80)) {
      add('warning', null, tr('Vista {0}: lo spostamento oltre ±80 viene tagliato a 80.', context))
    }
    const scale = transform['scale']
    if (isVec3(scale) && scale.some((v) => v > 4)) {
      add('warning', null, tr('Vista {0}: la scala oltre 4 viene mostrata come 4.', context))
    }
  }
}

/** The oldest supported release whose format has `feature` (e.g. "1.21.11"). */
export function firstRelease(feature: PackVersion): string {
  const oldestFirst = [...GAME_RELEASES].reverse()
  return (
    oldestFirst.find((release) => comparePackVersions(release.resourceFormat, feature) >= 0)
      ?.version ?? tr('una versione futura')
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
