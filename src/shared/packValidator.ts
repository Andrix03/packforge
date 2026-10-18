// Pack validator for LabPBR maps: sizes and animation against the texture, emission and height
// values, orphan files. Pure: the renderer loads the files and calls these checks.
//
// Size and animation rules follow Iris (AtlasPBRLoader, branch 26.1, read 2026-10-19): a map uses
// its OWN .png.mcmeta for its frame size; a map whose size is not a multiple of that frame is
// skipped; each frame is resized to the texture's frame size, nearest-neighbour only for exact
// integer enlargements, bilinear otherwise (which mixes the metal codes and emission values).
// Value rules from the LabPBR spec: height 0 breaks some POM, emission 255 = off, 230–237 metals.

import { parseAnimation } from './animation'
import { mapKindOf, type MapKind } from './labpbr'

export type Severity = 'error' | 'warning' | 'info'

export interface Issue {
  severity: Severity
  /** The file the issue is about. */
  path: string
  /** Italian, one sentence or two. */
  message: string
}

export interface Image {
  width: number
  height: number
  /** RGBA, straight alpha. */
  data: ArrayLike<number>
}

/** A LabPBR map of the pack and the texture it belongs to. */
export interface MapPair {
  path: string
  kind: MapKind
  /** The texture's PNG, or null when neither the pack nor the game has it. */
  albedo: string | null
  albedoSource: 'pack' | 'vanilla' | null
}

const TEXTURES = /^assets\/[^/]+\/textures\//

/** The `_n` / `_s` maps of the pack (under `textures/`) and where their texture is. */
export function findMapPairs(
  packFiles: readonly string[],
  vanillaFiles: ReadonlySet<string> | null
): MapPair[] {
  const pack = new Set(packFiles)
  const pairs: MapPair[] = []
  for (const path of packFiles) {
    if (!TEXTURES.test(path)) continue
    const kind = mapKindOf(path)
    if (!kind) continue
    const albedo = path.replace(/_[ns]\.png$/i, '.png')
    const source = pack.has(albedo) ? 'pack' : vanillaFiles?.has(albedo) ? 'vanilla' : null
    // A texture of the game whose name just ends in _n / _s (particle/sga_n.png).
    if (!source && vanillaFiles?.has(path)) continue
    pairs.push({ path, kind, albedo: source ? albedo : null, albedoSource: source })
  }
  return pairs
}

/** Orphans that need no image: maps without a texture, `.png.mcmeta` without its PNG. */
export function checkOrphans(
  packFiles: readonly string[],
  pairs: readonly MapPair[],
  vanillaLoaded: boolean
): Issue[] {
  const pack = new Set(packFiles)
  const issues: Issue[] = []
  for (const pair of pairs) {
    if (pair.albedo) continue
    const name = pair.path
      .replace(/_[ns]\.png$/i, '.png')
      .split('/')
      .pop()
    issues.push({
      severity: vanillaLoaded ? 'warning' : 'info',
      path: pair.path,
      message: vanillaLoaded
        ? `Mappa orfana: né il pack né il gioco hanno ${name}, quindi non viene usata.`
        : `Il pack non ha ${name}: va bene solo se esiste nel gioco (carica il jar vanilla per verificarlo).`
    })
  }
  for (const path of packFiles) {
    if (!/\.png\.mcmeta$/i.test(path)) continue
    if (!pack.has(path.slice(0, -'.mcmeta'.length))) {
      issues.push({
        severity: 'warning',
        path,
        message: 'File .mcmeta orfano: la PNG accanto non esiste, il gioco lo ignora.'
      })
    }
  }
  return issues
}

interface Frame {
  width: number
  height: number
  count: number
}

/** Frame of an image as the game reads it: the animation's frame, or the whole image. */
function frameOf(width: number, height: number, mcmeta: unknown): Frame | string {
  const parsed = parseAnimation(mcmeta, width, height)
  if (!parsed.ok) return parsed.error
  const animation = parsed.animation
  if (!animation) return { width, height, count: 1 }
  return {
    width: animation.frameWidth,
    height: animation.frameHeight,
    count: animation.frameCount
  }
}

/**
 * Size and animation of a map against its texture (`mcmeta` = parsed `.png.mcmeta`, or null when
 * the file is missing).
 */
export function checkMapShape(
  path: string,
  map: { width: number; height: number; mcmeta: unknown },
  albedo: { width: number; height: number; mcmeta: unknown }
): Issue[] {
  const issue = (severity: Severity, message: string): Issue[] => [{ severity, path, message }]
  const own = frameOf(map.width, map.height, map.mcmeta)
  if (typeof own === 'string') return issue('error', `Animazione della mappa non valida: ${own}`)
  const base = frameOf(albedo.width, albedo.height, albedo.mcmeta)
  if (typeof base === 'string') return []

  const issues: Issue[] = []
  const mcmetaName = `${path.split('/').pop()}.mcmeta`
  if (base.count > 1 && own.count === 1 && map.height > map.width) {
    return issue(
      'error',
      `La texture è animata ma manca ${mcmetaName}: Iris schiaccia tutta la striscia in un solo frame. Apri la texture in PackForge e premi Ctrl+S: lo crea.`
    )
  }
  if (own.width * base.height !== own.height * base.width) {
    return issue(
      'error',
      `Proporzioni diverse dalla texture (frame ${own.width}×${own.height} contro ${base.width}×${base.height}): la mappa viene deformata.`
    )
  }
  if (own.width !== base.width) {
    const exact = base.width % own.width === 0
    issues.push(
      exact
        ? {
            severity: 'info',
            path,
            message: `Più piccola della texture (${own.width}×${own.height} contro ${base.width}×${base.height}): viene ingrandita a pixel netti, va bene.`
          }
        : {
            severity: 'warning',
            path,
            message: `Dimensione ${own.width}×${own.height} contro ${base.width}×${base.height}: viene ridimensionata con sfumatura, che mescola i valori (metalli, emissione). Meglio la stessa dimensione della texture.`
          }
    )
  }
  if (base.count > 1 && own.count > 1 && own.count !== base.count) {
    issues.push({
      severity: 'warning',
      path,
      message: `${own.count} frame contro i ${base.count} della texture: le animazioni non vanno di pari passo.`
    })
  }
  return issues
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Values of a `_s`: emission everywhere, wiped pixels, undefined metal codes, light on holes. */
export function checkSpecular(path: string, image: Image, albedo: Image | null): Issue[] {
  const { data } = image
  const pixels = image.width * image.height
  const sameSize = albedo !== null && albedo.width === image.width && albedo.height === image.height
  let emitting = 0
  let opaque = 0
  let wiped = 0
  let undefinedMetal = 0
  let lightOnHoles = 0
  for (let i = 0; i < pixels; i++) {
    const [r, g, b, a] = [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!, data[i * 4 + 3]!]
    const hole = sameSize && albedo.data[i * 4 + 3]! === 0
    if (!hole) opaque++
    if (a > 0 && a < 255) {
      if (hole) lightOnHoles++
      else emitting++
    }
    if (a === 0 && r === 0 && g === 0 && b === 0) wiped++
    if (g >= 238 && g <= 254) undefinedMetal++
  }
  const issues: Issue[] = []
  if (opaque > 0 && emitting === opaque) {
    issues.push({
      severity: 'warning',
      path,
      message:
        'Tutti i pixel emettono luce (alpha tra 1 e 254). In LabPBR l’alpha è l’emissione e 255 vuol dire spenta: se il blocco non deve brillare, porta l’alpha a 255.'
    })
  }
  if (wiped > 0) {
    issues.push({
      severity: 'warning',
      path,
      message: `${plural(wiped, 'pixel è', 'pixel sono')} completamente trasparenti e neri: un editor che tratta l’alpha come trasparenza può averne cancellato i valori (riflettanza 0 = nessun riflesso).`
    })
  }
  if (undefinedMetal > 0) {
    issues.push({
      severity: 'warning',
      path,
      message: `${plural(undefinedMetal, 'pixel ha', 'pixel hanno')} il verde tra 238 e 254: non sono metalli definiti da LabPBR (usa 230–237 o 255).`
    })
  }
  if (lightOnHoles > 0) {
    issues.push({
      severity: 'info',
      path,
      message: `${plural(lightOnHoles, 'pixel emette', 'pixel emettono')} luce dove la texture è trasparente: non si vede.`
    })
  }
  return issues
}

/** Values of a `_n`: height 0 (the spec advises ≥ 1), normals longer than 1. */
export function checkNormal(path: string, image: Image): Issue[] {
  const { data } = image
  const pixels = image.width * image.height
  let zero = 0
  let invalid = 0
  for (let i = 0; i < pixels; i++) {
    if (data[i * 4 + 3]! === 0) zero++
    const x = (data[i * 4]! / 255) * 2 - 1
    const y = (data[i * 4 + 1]! / 255) * 2 - 1
    // 8-bit rounding of a unit normal stays well under 1.05.
    if (x * x + y * y > 1.05) invalid++
  }
  const issues: Issue[] = []
  if (zero === pixels) {
    issues.push({
      severity: 'error',
      path,
      message:
        'Altezza 0 ovunque (alpha trasparente): tutto il blocco sprofonda nel rilievo POM. Probabilmente il file è stato salvato con l’alpha come trasparenza; un _n senza rilievo ha alpha 255.'
    })
  } else if (zero > 0) {
    issues.push({
      severity: 'warning',
      path,
      message: `${plural(zero, 'pixel ha', 'pixel hanno')} altezza 0: la specifica consiglia almeno 1, alcuni shader pack sbagliano il rilievo POM con lo 0.`
    })
  }
  if (invalid > 0) {
    issues.push({
      severity: 'warning',
      path,
      message: `${plural(invalid, 'normale è', 'normali sono')} fuori scala (rosso e verde troppo lontani da 128 insieme): lo shader le schiaccia. Rigenera le normali dall’altezza.`
    })
  }
  return issues
}

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

/** Errors first, then by path. */
export function sortIssues(issues: readonly Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity] || a.path.localeCompare(b.path)
  )
}
