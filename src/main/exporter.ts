import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
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
import { decodePng, encodePng } from '../shared/pngCodec'
import { factorBetween, scaleMcmeta, scaleNearest } from '../shared/resize'
import { listPackFiles, type PackSource } from './packSource'
import { writePackBytes } from './textureFile'

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
    check.errors.push('Solo i pack in cartella si esportano (un pack zip è già un export).')
    return check
  }
  const { files } = await listPackFiles(source)
  for (const path of files) {
    const reason = strayReason(path)
    if (reason) check.stray.push({ path, reason })
  }
  check.files = filesForVariant(files, { kind: 'full' }).length
  if (!files.includes('pack.mcmeta')) {
    check.errors.push('Manca pack.mcmeta: il gioco non riconosce il pack.')
  } else {
    const analysis = analyzePackMcmeta(await readFile(join(source.root, 'pack.mcmeta'), 'utf8'))
    for (const issue of analysis.issues) {
      if (issue.severity === 'error') check.errors.push(issue.message)
      else check.warnings.push(issue.message)
    }
  }
  if (!files.includes('pack.png')) check.warnings.push('Manca pack.png: il pack non avrà un’icona.')
  if (vanilla?.kind === 'zip') {
    const candidates = new Set(
      files.filter((p) => p.endsWith('.png') && p.startsWith('assets/minecraft/'))
    )
    const entries = unzipSync(vanilla.data, { filter: (f) => candidates.has(f.name) })
    for (const [path, theirs] of Object.entries(entries)) {
      const mine = decodePng(await readFile(join(source.root, ...path.split('/'))))
      const game = decodePng(theirs)
      if (mine.ok && game.ok && samePixels(mine.image, game.image)) check.vanillaCopies.push(path)
    }
    check.vanillaCopies.sort()
    if (check.vanillaCopies.length > 0) {
      check.errors.push(
        `${check.vanillaCopies.length} texture sono identiche a quelle del gioco: non si possono ridistribuire (e non servono, il gioco le ha già). Toglile dal pack.`
      )
    }
  } else {
    check.warnings.push(
      'Carica un jar vanilla per controllare che il pack non contenga texture del gioco.'
    )
  }
  if (check.stray.length > 0) {
    check.warnings.push(
      `${check.stray.length} file di lavoro o di sistema restano fuori dallo zip.`
    )
  }
  return check
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
  }
): Promise<ExportResult> {
  if (source.kind !== 'folder') return { ok: false, error: 'Solo i pack in cartella si esportano.' }
  const { packName, info, variant, overwrite } = options
  if (!isAbsolute(options.dir)) return { ok: false, error: 'Cartella di destinazione non valida.' }
  const root = await realpath(source.root)
  const dir = resolve(options.dir)
  // Compare real paths on both sides: 8.3 short names (C:\Users\RUNNER~1) or junctions would
  // otherwise make a folder inside the pack look like it's outside.
  const rel = relative(root, await realpathOfExisting(dir))
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
    return {
      ok: false,
      error: 'La destinazione non può stare dentro il pack (finirebbe nel prossimo export).'
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
    return { ok: false, error: `${target} esiste già.`, exists: true }
  }

  const { files } = await listPackFiles(source)
  const zip: Zippable = {}
  /** Textures left at their size in a resolution variant (no integer ratio). */
  const kept: string[] = []
  const factors = new Map<string, ReturnType<typeof factorBetween>>()
  for (const path of filesForVariant(files, variant)) {
    let bytes: Uint8Array = await readFile(join(root, ...path.split('/')))
    if (variant.kind === 'resolution' && SCALED.test(path) && path.endsWith('.png')) {
      const decoded = decodePng(bytes)
      const factor = decoded.ok ? factorBetween(decoded.image.width, variant.resolution) : null
      const scaled = decoded.ok && factor ? scaleNearest(decoded.image, factor) : null
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
  const temp = `${target}.tmp`
  await writeFile(temp, data)
  try {
    await rename(temp, target)
  } catch (error) {
    await rm(temp, { force: true })
    return {
      ok: false,
      error: `Scrittura non riuscita: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  return {
    ok: true,
    path: target,
    files: Object.keys(zip).length,
    bytes: data.length,
    kept: kept.sort()
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
  if (source.kind !== 'folder') return { ok: false, error: 'Solo i pack in cartella.' }
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
