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
import { tr } from './i18n'

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

/**
 * Orphans that need no image: maps without a texture, `.png.mcmeta` without a PNG. The game
 * stacks packs: a `.png.mcmeta` (and a map) applies to the PNG of the same pack or of any pack
 * BELOW it, vanilla included (FallbackResourceManager in 26.3: listResources keeps the topmost
 * .mcmeta when its pack index ≥ the PNG's; getResource searches from the top down to the PNG's
 * pack). So a lone .mcmeta for a game texture is valid: it changes the game's animation.
 */
export function checkOrphans(
  packFiles: readonly string[],
  pairs: readonly MapPair[],
  vanillaFiles: ReadonlySet<string> | null
): Issue[] {
  const pack = new Set(packFiles)
  const issues: Issue[] = []
  const orphan = (path: string, png: string, what: string): Issue => {
    const name = png.split('/').pop()
    return vanillaFiles
      ? {
          severity: 'warning',
          path,
          message: tr(
            '{0}: né il pack né il gioco hanno {1}. Funziona solo se un altro pack attivo sotto questo la fornisce.',
            what,
            name
          )
        }
      : {
          severity: 'info',
          path,
          message: tr(
            'Il pack non ha {0}: va bene se esiste nel gioco o in un pack sotto questo (carica il jar vanilla per verificarlo).',
            name
          )
        }
  }
  for (const pair of pairs) {
    if (!pair.albedo) {
      issues.push(orphan(pair.path, pair.path.replace(/_[ns].png$/i, '.png'), tr('Mappa orfana')))
    }
  }
  for (const path of packFiles) {
    if (!/.png.mcmeta$/i.test(path)) continue
    const png = path.slice(0, -'.mcmeta'.length)
    if (!pack.has(png) && !vanillaFiles?.has(png))
      issues.push(orphan(path, png, tr('File .mcmeta orfano')))
  }
  return issues
}

/**
 * The pack's `.png.mcmeta` files whose PNG comes from the game (they animate the game's
 * texture): checked against that PNG's size by `checkTextureMcmeta`.
 */
export function mcmetaForGameTextures(
  packFiles: readonly string[],
  vanillaFiles: ReadonlySet<string> | null
): string[] {
  const pack = new Set(packFiles)
  return packFiles.filter((path) => {
    if (!/.png.mcmeta$/i.test(path)) return false
    const png = path.slice(0, -'.mcmeta'.length)
    return !pack.has(png) && vanillaFiles?.has(png) === true
  })
}

/** An animation that does not fit its PNG: the game shows the missing texture. */
export function checkTextureMcmeta(
  path: string,
  png: { width: number; height: number },
  mcmeta: unknown
): Issue[] {
  const parsed = parseAnimation(mcmeta, png.width, png.height)
  if (parsed.ok) return []
  return [
    {
      severity: 'error',
      path,
      message: tr(
        'Animazione non valida per la texture del gioco ({0}×{1}): {2}',
        png.width,
        png.height,
        parsed.error
      )
    }
  ]
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
  if (typeof own === 'string') {
    // parseAnimation speaks of textures (missing texture); a broken map is just not used.
    const reason = own.replace(/: il gioco mostrerà la texture mancante\.$/, '.')
    return issue('error', tr('Animazione della mappa non valida, Iris non la usa. {0}', reason))
  }
  const base = frameOf(albedo.width, albedo.height, albedo.mcmeta)
  if (typeof base === 'string') return []

  const issues: Issue[] = []
  const mcmetaName = `${path.split('/').pop()}.mcmeta`
  if (base.count > 1 && own.count === 1 && map.height > map.width) {
    return issue(
      'error',
      tr(
        'La texture è animata ma manca {0}: Iris schiaccia tutta la striscia in un solo frame. Apri la texture in PackForge e premi Ctrl+S: lo crea.',
        mcmetaName
      )
    )
  }
  if (own.width * base.height !== own.height * base.width) {
    return issue(
      'error',
      tr(
        'Proporzioni diverse dalla texture (frame {0}×{1} contro {2}×{3}): la mappa viene deformata.',
        own.width,
        own.height,
        base.width,
        base.height
      )
    )
  }
  if (own.width !== base.width) {
    const exact = base.width % own.width === 0
    issues.push(
      exact
        ? {
            severity: 'info',
            path,
            message: tr(
              'Più piccola della texture ({0}×{1} contro {2}×{3}): viene ingrandita a pixel netti, va bene.',
              own.width,
              own.height,
              base.width,
              base.height
            )
          }
        : {
            severity: 'warning',
            path,
            message: tr(
              'Dimensione {0}×{1} contro {2}×{3}: viene ridimensionata con sfumatura, che mescola i valori (metalli, emissione). Meglio la stessa dimensione della texture.',
              own.width,
              own.height,
              base.width,
              base.height
            )
          }
    )
  }
  if (base.count > 1 && own.count > 1 && own.count !== base.count) {
    issues.push({
      severity: 'warning',
      path,
      message: tr(
        '{0} frame contro i {1} della texture: le animazioni non vanno di pari passo.',
        own.count,
        base.count
      )
    })
  }
  return issues
}

/**
 * Which map pixels lie under a fully transparent texture pixel (invisible in game: other editors
 * often save them as 0, which is fine). Maps of another size are compared by scaling, when the
 * proportions match; otherwise no pixel counts as a hole.
 */
function holesOf(image: Image, albedo: Image | null): (index: number) => boolean {
  if (!albedo || albedo.width * image.height !== albedo.height * image.width) return () => false
  const sx = albedo.width / image.width
  const sy = albedo.height / image.height
  return (index) => {
    const x = Math.floor((index % image.width) * sx)
    const y = Math.floor(Math.floor(index / image.width) * sy)
    return albedo.data[(y * albedo.width + x) * 4 + 3]! === 0
  }
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/**
 * Values of a `_s`: emission everywhere, wiped pixels, undefined metal codes (only where the
 * texture is visible), and light on its transparent pixels.
 */
export function checkSpecular(path: string, image: Image, albedo: Image | null): Issue[] {
  const { data } = image
  const pixels = image.width * image.height
  const isHole = holesOf(image, albedo)
  let emitting = 0
  let opaque = 0
  let wiped = 0
  let undefinedMetal = 0
  let lightOnHoles = 0
  for (let i = 0; i < pixels; i++) {
    const [r, g, b, a] = [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!, data[i * 4 + 3]!]
    if (isHole(i)) {
      if (a > 0 && a < 255) lightOnHoles++
      continue
    }
    opaque++
    if (a > 0 && a < 255) emitting++
    if (a === 0 && r === 0 && g === 0 && b === 0) wiped++
    if (g >= 238 && g <= 254) undefinedMetal++
  }
  const issues: Issue[] = []
  if (opaque > 0 && emitting === opaque) {
    issues.push({
      severity: 'warning',
      path,
      message: tr(
        'Tutti i pixel emettono luce (alpha tra 1 e 254). In LabPBR l’alpha è l’emissione e 255 vuol dire spenta: se il blocco non deve brillare, porta l’alpha a 255.'
      )
    })
  }
  if (wiped > 0) {
    issues.push({
      severity: 'warning',
      path,
      message: tr(
        '{0} completamente trasparenti e neri: un editor che tratta l’alpha come trasparenza può averne cancellato i valori (riflettanza 0 = nessun riflesso).',
        plural(wiped, tr('pixel è'), tr('pixel sono'))
      )
    })
  }
  if (undefinedMetal > 0) {
    issues.push({
      severity: 'warning',
      path,
      message: tr(
        '{0} il verde tra 238 e 254: non sono metalli definiti da LabPBR (usa 230–237 o 255).',
        plural(undefinedMetal, tr('pixel ha'), tr('pixel hanno'))
      )
    })
  }
  if (lightOnHoles > 0) {
    issues.push({
      severity: 'info',
      path,
      message: tr(
        '{0} luce dove la texture è trasparente: non si vede.',
        plural(lightOnHoles, tr('pixel emette'), tr('pixel emettono'))
      )
    })
  }
  return issues
}

/** Values of a `_n`: height 0 (the spec advises ≥ 1), normals longer than 1. */
export function checkNormal(path: string, image: Image, albedo: Image | null = null): Issue[] {
  const { data } = image
  const pixels = image.width * image.height
  const isHole = holesOf(image, albedo)
  let visible = 0
  let zero = 0
  let invalid = 0
  for (let i = 0; i < pixels; i++) {
    if (isHole(i)) continue
    visible++
    if (data[i * 4 + 3]! === 0) zero++
    const x = (data[i * 4]! / 255) * 2 - 1
    const y = (data[i * 4 + 1]! / 255) * 2 - 1
    // 8-bit rounding of a unit normal stays well under 1.05.
    if (x * x + y * y > 1.05) invalid++
  }
  const issues: Issue[] = []
  if (visible > 0 && zero === visible) {
    issues.push({
      severity: 'error',
      path,
      message: tr(
        'Altezza 0 ovunque (alpha trasparente): tutto il blocco sprofonda nel rilievo POM. Probabilmente il file è stato salvato con l’alpha come trasparenza; un _n senza rilievo ha alpha 255.'
      )
    })
  } else if (zero > 0) {
    issues.push({
      severity: 'warning',
      path,
      message: tr(
        '{0} altezza 0: la specifica consiglia almeno 1, alcuni shader pack sbagliano il rilievo POM con lo 0.',
        plural(zero, tr('pixel ha'), tr('pixel hanno'))
      )
    })
  }
  if (invalid > 0) {
    issues.push({
      severity: 'warning',
      path,
      message: tr(
        '{0} fuori scala (rosso e verde troppo lontani da 128 insieme): lo shader le schiaccia. Rigenera le normali dall’altezza.',
        plural(invalid, tr('normale è'), tr('normali sono'))
      )
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
