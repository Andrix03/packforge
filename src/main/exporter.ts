import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { unzipSync, zipSync, type Zippable } from 'fflate'
import {
  changelogText,
  creditsText,
  exportFileName,
  filesForVariant,
  licenseText,
  LICENSES,
  parseProject,
  PROJECT_FILE,
  strayReason,
  type ExportCheck,
  type ExportResult,
  type ExportVariant,
  type ListingResult,
  type ProjectInfo
} from '../shared/exportPlan'
import { compatibleReleases, analyzePackMcmeta } from '../shared/mcmeta'
import { descriptionMarkdown, factsFromFiles, listingText } from '../shared/listing'
import { summarizeReleaseSpans } from '../shared/packFormat'
import { readPngSize } from '../shared/png'
import { PANORAMA_FACES, panoramaMissing, panoramaSizes } from '../shared/panorama'
import { offPalettePixels } from '../shared/equipment'
import { BASE_PALETTES } from '../shared/trims'
import { decodePng, encodePng, optimizePng } from '../shared/pngCodec'
import { factorBetween, scaleMcmeta, scaleNearest, type Factor } from '../shared/resize'
import { writeFileAtomic } from './atomicWrite'
import { listPackFiles, type PackSource } from './packSource'
import { writePackBytes } from './textureFile'
import { tr } from '../shared/i18n'

// Export of a folder pack to a versioned zip (see shared/exportPlan.ts for what goes in).

export async function readProject(root: string): Promise<ProjectInfo> {
  try {
    return parseProject(JSON.parse(await readFile(join(root, PROJECT_FILE), 'utf8')))
  } catch {
    return parseProject(null)
  }
}

export async function saveProject(
  root: string,
  info: unknown
): Promise<{ ok: boolean; error?: string }> {
  // Only what parseProject accepts is written.
  const clean = parseProject(info)
  const result = await writePackBytes(
    root,
    PROJECT_FILE,
    Buffer.from(`${JSON.stringify(clean, null, 2)}\n`)
  )
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}

/** Problems to fix before publishing. `vanilla` (the loaded jar) enables the copy check. */
export async function checkExport(
  source: PackSource,
  vanilla: PackSource | null
): Promise<ExportCheck> {
  const check: ExportCheck = { errors: [], warnings: [], vanillaCopies: [], stray: [], files: 0 }
  if (source.kind !== 'folder') {
    check.errors.push(tr('Solo i pack in cartella si esportano (un pack zip è già un export).'))
    return check
  }
  const { files } = await listPackFiles(source)
  for (const path of files) {
    const reason = strayReason(path)
    if (reason) check.stray.push({ path, reason })
  }
  check.files = filesForVariant(files, { kind: 'full' }).length
  if (!files.includes('pack.mcmeta')) {
    check.errors.push(tr('Manca pack.mcmeta: il gioco non riconosce il pack.'))
  } else {
    const analysis = analyzePackMcmeta(await readFile(join(source.root, 'pack.mcmeta'), 'utf8'))
    for (const issue of analysis.issues) {
      if (issue.severity === 'error') check.errors.push(issue.message)
      else check.warnings.push(issue.message)
    }
  }
  if (!files.includes('pack.png'))
    check.warnings.push(tr('Manca pack.png: il pack non avrà un’icona.'))
  // A partial or mixed-size panorama makes the game reject the whole pack.
  const partial = panoramaMissing(files)
  if (partial) check.errors.push(partial)
  else if (PANORAMA_FACES.every((face) => files.includes(face))) {
    const sizes = await Promise.all(
      PANORAMA_FACES.map(async (face) => {
        const size = readPngSize(await readFile(join(source.root, ...face.split('/'))))
        return size ? ([size.width, size.height] as const) : null
      })
    )
    const mixed = panoramaSizes(sizes)
    if (mixed) check.errors.push(mixed)
  }
  if (vanilla?.kind === 'zip') {
    check.vanillaCopies = await findVanillaCopies(source.root, files, vanilla.data)
    if (check.vanillaCopies.length > 0) {
      check.errors.push(
        tr(
          '{0} texture sono identiche a quelle del gioco: non si possono ridistribuire (e non servono, il gioco le ha già). Toglile dal pack.',
          check.vanillaCopies.length
        )
      )
    }
  } else {
    check.warnings.push(
      tr('Carica un jar vanilla per controllare che il pack non contenga texture del gioco.')
    )
  }
  const offTrims = await trimsOffPalette(source.root, files, vanilla)
  if (offTrims.length > 0) {
    check.warnings.push(
      tr(
        'Motivi di finitura con colori fuori dai grigi di trim_base (nel gioco non prendono il colore del materiale): {0}',
        offTrims.join(', ')
      )
    )
  }
  if (check.stray.length > 0) {
    check.warnings.push(
      tr('{0} file di lavoro o di sistema restano fuori dallo zip.', check.stray.length)
    )
  }
  return check
}

/** Trim patterns of the pack painted with greys the game does not recolour (file names). */
async function trimsOffPalette(
  root: string,
  files: readonly string[],
  vanilla: PackSource | null
): Promise<string[]> {
  const patterns = files.filter((p) =>
    /^assets\/[^/]+\/textures\/trims\/(entity|items)\/.+\.png$/.test(p)
  )
  if (patterns.length === 0) return []
  // The base palette: the pack's own, else the game's.
  let baseBytes: Uint8Array | null = null
  for (const path of BASE_PALETTES) {
    if (files.includes(path)) {
      baseBytes = await readFile(join(root, ...path.split('/')))
      break
    }
  }
  if (!baseBytes && vanilla?.kind === 'zip') {
    const found = unzipSync(vanilla.data, {
      filter: (f) => (BASE_PALETTES as readonly string[]).includes(f.name)
    })
    baseBytes = BASE_PALETTES.map((path) => found[path]).find((bytes) => bytes) ?? null
  }
  const base = baseBytes ? decodePng(baseBytes) : null
  if (!base?.ok) return []
  const off: string[] = []
  for (const path of patterns) {
    const image = decodePng(await readFile(join(root, ...path.split('/'))))
    if (image.ok && offPalettePixels(image.image, base.image) > 0)
      off.push(path.slice(path.lastIndexOf('/') + 1))
  }
  return off
}

/** Pack PNGs whose pixels equal the game's texture at the same path (never redistributable). */
async function findVanillaCopies(
  root: string,
  files: readonly string[],
  jar: Uint8Array
): Promise<string[]> {
  const candidates = new Set(
    files.filter((p) => p.endsWith('.png') && p.startsWith('assets/minecraft/'))
  )
  const entries = unzipSync(jar, { filter: (f) => candidates.has(f.name) })
  const copies: string[] = []
  for (const [path, theirs] of Object.entries(entries)) {
    const mine = decodePng(await readFile(join(root, ...path.split('/'))))
    const game = decodePng(theirs)
    if (mine.ok && game.ok && samePixels(mine.image, game.image)) copies.push(path)
  }
  return copies.sort()
}

function samePixels(
  a: { width: number; height: number; data: ArrayLike<number> },
  b: { width: number; height: number; data: ArrayLike<number> }
): boolean {
  if (a.width !== b.width || a.height !== b.height) return false
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false
  return true
}

/** Folders under textures/ whose PNGs follow the pack resolution (GUI sprites keep their size). */
const SCALED =
  /^assets\/[^/]+\/(textures\/(block|item|entity|particle|painting|trims)\/|optifine\/ctm\/)/

export async function buildExport(
  source: PackSource,
  options: {
    packName: string
    info: ProjectInfo
    variant: ExportVariant
    dir: string
    overwrite: boolean
    /** The loaded client jar: an export never contains the game's own textures. */
    vanilla?: PackSource | null
  }
): Promise<ExportResult> {
  if (source.kind !== 'folder')
    return { ok: false, error: tr('Solo i pack in cartella si esportano.') }
  const { packName, info, variant, overwrite } = options
  if (!isAbsolute(options.dir))
    return { ok: false, error: tr('Cartella di destinazione non valida.') }
  const root = await realpath(source.root)
  const dir = resolve(options.dir)
  // Compare real paths on both sides: 8.3 short names (C:\Users\RUNNER~1) or junctions would
  // otherwise make a folder inside the pack look like it's outside.
  const rel = relative(root, await realpathOfExisting(dir))
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return {
      ok: false,
      error: tr('La destinazione non può stare dentro il pack (finirebbe nel prossimo export).')
    }
  }
  const target = join(dir, exportFileName(packName, info.version, variant))
  if (
    !overwrite &&
    (await stat(target).then(
      () => true,
      () => false
    ))
  ) {
    return { ok: false, error: tr('{0} esiste già.', target), exists: true }
  }

  const { files } = await listPackFiles(source)
  // The dialog shows this check first; main enforces it whatever the renderer says.
  if (options.vanilla?.kind === 'zip') {
    const copies = await findVanillaCopies(root, files, options.vanilla.data)
    if (copies.length > 0) {
      return {
        ok: false,
        error: tr(
          '{0} texture sono identiche a quelle del gioco (es. {1}): toglile dal pack prima di esportare.',
          copies.length,
          copies[0]
        )
      }
    }
  }
  const zip: Zippable = {}
  /** Textures left at their size in a resolution variant (no integer ratio). */
  const kept: string[] = []
  const factors = new Map<string, ReturnType<typeof factorBetween>>()
  let saved = 0
  for (const path of filesForVariant(files, variant)) {
    let bytes: Uint8Array = await readFile(join(root, ...path.split('/')))
    if (variant.kind === 'resolution' && SCALED.test(path) && path.endsWith('.png')) {
      const decoded = decodePng(bytes)
      const factor = decoded.ok ? factorBetween(decoded.image.width, variant.resolution) : null
      const scaled =
        decoded.ok && factor && (await mcmetaScales(root, files, path, factor))
          ? scaleNearest(decoded.image, factor)
          : null
      if (decoded.ok && factor && scaled) {
        bytes = encodePng({
          width: scaled.width,
          height: scaled.height,
          data: new Uint8Array(scaled.data)
        })
        factors.set(path, factor)
      } else {
        kept.push(path)
      }
    }
    if (path.endsWith('.png')) {
      // Lossless: indexed when it has few colours, every candidate checked pixel by pixel.
      const optimized = optimizePng(bytes)
      saved += bytes.length - optimized.length
      bytes = optimized
    }
    zip[path] = [bytes, { level: path.endsWith('.png') ? 0 : 6 }]
  }
  // Explicit animation frame sizes follow their PNG.
  for (const [png, factor] of factors) {
    const mcmeta = `${png}.mcmeta`
    if (factor && zip[mcmeta]) {
      const scaled = scaleMcmeta(
        Buffer.from((zip[mcmeta] as [Uint8Array, unknown])[0]).toString('utf8'),
        factor
      )
      if (scaled !== null) zip[mcmeta] = [Buffer.from(scaled), { level: 6 }]
    }
  }
  const year = new Date().getFullYear()
  zip['LICENSE.txt'] = Buffer.from(licenseText(info, packName, year))
  zip['CREDITS.txt'] = Buffer.from(creditsText(info, packName))
  zip['CHANGELOG.md'] = Buffer.from(changelogText(info, packName))

  const data = zipSync(zip)
  await mkdir(dir, { recursive: true })
  try {
    await writeFileAtomic(target, data)
  } catch (error) {
    return {
      ok: false,
      error: tr(
        'Scrittura non riuscita: {0}',
        error instanceof Error ? error.message : String(error)
      )
    }
  }
  return {
    ok: true,
    path: target,
    files: Object.keys(zip).length,
    bytes: data.length,
    kept: kept.sort(),
    saved
  }
}

/** Where exports go unless chosen: `<pack folder> - export` next to the pack. */
/** Real path of `path`, resolving its nearest existing ancestor (the folder may not exist yet). */
async function realpathOfExisting(path: string): Promise<string> {
  const real = await realpath(path).catch(() => null)
  if (real) return real
  const parent = dirname(path)
  if (parent === path) return path
  return join(await realpathOfExisting(parent), relative(parent, path))
}

export function defaultExportDir(packRoot: string): string {
  return join(
    dirname(packRoot),
    `${packRoot
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop()} - export`
  )
}

/**
 * The upload kit for Modrinth / CurseForge in `<dir>/listing/<version>/`: descriptions (EN, IT)
 * and listing.txt. Existing files are kept (they may have been edited by hand).
 */
export async function writeListing(
  source: PackSource,
  options: { packName: string; info: ProjectInfo; dir: string }
): Promise<ListingResult> {
  if (source.kind !== 'folder') return { ok: false, error: tr('Solo i pack in cartella.') }
  const root = await realpath(source.root)
  const { files } = await listPackFiles(source)
  const widths = new Map<string, number>()
  for (const path of files) {
    if (!/^assets\/[^/]+\/textures\/.+\.png$/.test(path)) continue
    const size = readPngSize(await readFile(join(root, ...path.split('/'))))
    if (size) widths.set(path, size.width)
  }
  let gameVersions: string[] = []
  if (files.includes('pack.mcmeta')) {
    const analysis = analyzePackMcmeta(await readFile(join(root, 'pack.mcmeta'), 'utf8'))
    gameVersions = summarizeReleaseSpans(compatibleReleases(analysis.formats))
  }
  const license = LICENSES.find((l) => l.id === options.info.license)?.name ?? options.info.license
  const facts = factsFromFiles(files, widths, {
    name: options.packName,
    author: options.info.author,
    version: options.info.version,
    license,
    gameVersions
  })
  const target = join(options.dir, 'listing', options.info.version)
  await mkdir(target, { recursive: true })
  const outputs: Array<[string, string]> = [
    ['description-en.md', descriptionMarkdown(facts, 'en')],
    ['description-it.md', descriptionMarkdown(facts, 'it')],
    [
      'listing.txt',
      listingText(facts, exportFileName(options.packName, options.info.version, { kind: 'full' }))
    ]
  ]
  const written: string[] = []
  const kept: string[] = []
  for (const [name, content] of outputs) {
    try {
      await writeFile(join(target, name), content, { flag: 'wx' })
      written.push(name)
    } catch (error) {
      if ((error as { code?: string }).code === 'EEXIST') kept.push(name)
      else return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
  return { ok: true, dir: target, written, kept }
}

/** The PNG's .png.mcmeta (if any) can follow the factor: its frame sizes stay whole pixels. */
async function mcmetaScales(
  root: string,
  files: readonly string[],
  png: string,
  factor: Factor
): Promise<boolean> {
  const mcmeta = `${png}.mcmeta`
  if (!files.includes(mcmeta)) return true
  try {
    scaleMcmeta(await readFile(join(root, ...mcmeta.split('/')), 'utf8'), factor)
    return true
  } catch {
    return false
  }
}
