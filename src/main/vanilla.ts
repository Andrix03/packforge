import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import type { VanillaVersionInfo } from '../shared/ipc'
import type { PackVersion } from '../shared/packFormat'
import { isSafePackPath, listPackFiles, readPackAsset, type PackSource } from './packSource'
import { decodePng } from '../shared/pngCodec'
import { tr } from '../shared/i18n'

// Vanilla textures are read from the user's own client jar, in memory, for
// reference only. Nothing from the jar is ever written to disk or a pack.

/** Jar folders exposed as reference: textures plus the models/states that use them. */
export const VANILLA_ASSET_PREFIXES = [
  'assets/minecraft/textures/',
  'assets/minecraft/models/',
  'assets/minecraft/blockstates/',
  // Item definitions (1.21.4+): what an item draws, for "3D in hand".
  'assets/minecraft/items/'
] as const
const MAX_JAR_BYTES = 512 * 1024 * 1024

/** Where the official launcher keeps `.minecraft` on Linux when installed from Flathub. */
const FLATPAK_MINECRAFT = ['.var', 'app', 'com.mojang.Minecraft', '.minecraft']

/**
 * `.minecraft` of the official launcher on a platform. On Linux the Flatpak launcher's folder is
 * used when it exists and the usual `~/.minecraft` doesn't.
 */
export function minecraftDirFor(
  platform: NodeJS.Platform,
  home: string,
  appData: string | undefined,
  exists: (path: string) => boolean
): string {
  if (platform === 'win32') return join(appData ?? join(home, 'AppData', 'Roaming'), '.minecraft')
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'minecraft')
  const usual = join(home, '.minecraft')
  const flatpak = join(home, ...FLATPAK_MINECRAFT)
  return !exists(usual) && exists(flatpak) ? flatpak : usual
}

/** Default `.minecraft` location for the official launcher on this PC. */
export function defaultMinecraftDir(): string {
  return minecraftDirFor(process.platform, homedir(), process.env['APPDATA'], existsSync)
}

/** Installed versions that have a client jar, newest first. */
export async function listInstalledVersions(minecraftDir: string): Promise<VanillaVersionInfo[]> {
  const versionsDir = join(minecraftDir, 'versions')
  let entries
  try {
    entries = await readdir(versionsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const versions: Array<VanillaVersionInfo & { releaseTime: string }> = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const id = entry.name
    try {
      // Modded profiles (e.g. Fabric) usually have no jar of their own: skipped.
      if (!(await stat(join(versionsDir, id, `${id}.jar`))).isFile()) continue
      const manifest: unknown = JSON.parse(
        await readFile(join(versionsDir, id, `${id}.json`), 'utf8')
      )
      const record = (typeof manifest === 'object' && manifest !== null ? manifest : {}) as Record<
        string,
        unknown
      >
      versions.push({
        id,
        type: typeof record['type'] === 'string' ? record['type'] : 'unknown',
        releaseTime: typeof record['releaseTime'] === 'string' ? record['releaseTime'] : ''
      })
    } catch {
      // Missing jar or unreadable manifest: not usable.
    }
  }

  versions.sort((a, b) => b.releaseTime.localeCompare(a.releaseTime) || b.id.localeCompare(a.id))
  return versions.map(({ id, type }) => ({ id, type }))
}

export type LoadedJarResult =
  | { ok: true; source: PackSource; resourceFormat: PackVersion | null }
  | { ok: false; error: string }

/**
 * Loads the client jar of an installed version. `versionId` is untrusted: it
 * must match a directory found by `listInstalledVersions`, so it cannot escape.
 */
export async function loadVanillaJar(
  minecraftDir: string,
  versionId: unknown
): Promise<LoadedJarResult> {
  const installed = await listInstalledVersions(minecraftDir)
  const version = installed.find((v) => v.id === versionId)
  if (!version) return { ok: false, error: tr('Versione di Minecraft non installata.') }

  const jarPath = join(minecraftDir, 'versions', version.id, `${version.id}.jar`)
  try {
    if ((await stat(jarPath)).size > MAX_JAR_BYTES) {
      return { ok: false, error: tr('Il jar del client è troppo grande.') }
    }
    const data = await readFile(jarPath)
    const overlay = await readIndexTextures(minecraftDir, version.id)
    return {
      ok: true,
      source: { kind: 'zip', root: jarPath, data, overlay },
      resourceFormat: readJarFormat(data)
    }
  } catch {
    return { ok: false, error: tr('Impossibile leggere il jar di {0}.', version.id) }
  }
}

/**
 * Textures the launcher downloads beside the jar (its asset index), as `assets/minecraft/…` →
 * bytes. Since 26.x the title panorama lives there and the jar only has 1×1 placeholders. Read in
 * memory, reference only, like the jar.
 */
export async function readIndexTextures(
  minecraftDir: string,
  versionId: string
): Promise<Map<string, Uint8Array>> {
  const overlay = new Map<string, Uint8Array>()
  try {
    const versionJson: unknown = JSON.parse(
      await readFile(join(minecraftDir, 'versions', versionId, `${versionId}.json`), 'utf8')
    )
    const record = versionJson as { assetIndex?: { id?: unknown }; assets?: unknown }
    const indexId = record.assetIndex?.id ?? record.assets
    if (typeof indexId !== 'string' || !/^[\w.-]+$/.test(indexId)) return overlay
    const index: unknown = JSON.parse(
      await readFile(join(minecraftDir, 'assets', 'indexes', `${indexId}.json`), 'utf8')
    )
    const objects = (index as { objects?: Record<string, { hash?: unknown; size?: unknown }> })
      .objects
    for (const [name, entry] of Object.entries(objects ?? {})) {
      if (!/^minecraft\/textures\/[a-z0-9_./-]+\.png$/.test(name)) continue
      if (!isSafePackPath(`assets/${name}`)) continue
      const hash = entry.hash
      if (typeof hash !== 'string' || !/^[0-9a-f]{40}$/.test(hash)) continue
      if (typeof entry.size === 'number' && entry.size > 16 * 1024 * 1024) continue
      const bytes = await readFile(
        join(minecraftDir, 'assets', 'objects', hash.slice(0, 2), hash)
      ).catch(() => null)
      if (bytes) overlay.set(`assets/${name}`, bytes)
    }
  } catch {
    // No version json or index (an old or modded install): the jar alone.
  }
  return overlay
}

/** Resource pack format from the jar's `version.json`, if readable. */
export function readJarFormat(jar: Uint8Array): PackVersion | null {
  try {
    const entries = unzipSync(jar, {
      filter: (file) => file.name === 'version.json' && file.originalSize <= 64 * 1024
    })
    const bytes = entries['version.json']
    if (!bytes) return null
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const pack = (json as { pack_version?: unknown }).pack_version
    if (typeof pack === 'number') return { major: pack, minor: 0 }
    if (typeof pack === 'object' && pack !== null) {
      const { resource_major: major, resource_minor: minor } = pack as Record<string, unknown>
      if (typeof major === 'number') return { major, minor: typeof minor === 'number' ? minor : 0 }
    }
    return null
  } catch {
    return null
  }
}

const hashCache = new Map<string, Record<string, string>>()

/**
 * Pixel hashes of a version's textures (`assets/minecraft/textures/…png` → sha1 of the decoded
 * size + RGBA), to find what a newer version renamed, added or removed. Only the hashes leave
 * this function; kept in memory per version.
 */
export async function textureHashes(
  minecraftDir: string,
  versionId: unknown
): Promise<{ ok: true; hashes: Record<string, string> } | { ok: false; error: string }> {
  if (typeof versionId !== 'string') return { ok: false, error: tr('Versione non valida.') }
  const key = `${minecraftDir}|${versionId}`
  const cached = hashCache.get(key)
  if (cached) return { ok: true, hashes: cached }
  const loaded = await loadVanillaJar(minecraftDir, versionId)
  if (!loaded.ok) return loaded
  const { files } = await listPackFiles(loaded.source, ['assets/minecraft/textures/'])
  const hashes: Record<string, string> = {}
  for (const path of files) {
    if (!path.endsWith('.png')) continue
    const asset = await readPackAsset(loaded.source, path)
    if (!asset) continue
    const decoded = decodePng(asset.bytes)
    if (!decoded.ok) continue
    const { width, height, data } = decoded.image
    hashes[path] = createHash('sha1').update(`${width}x${height}:`).update(data).digest('hex')
  }
  hashCache.set(key, hashes)
  return { ok: true, hashes }
}

/**
 * The game's texts in one language for the installed `versionId`: `en_us` from the jar, the
 * others from the launcher's asset index. Also the language codes the index offers. Read on
 * request (each file is ~0.5 MB), reference only: a pack gets just the lines the user changes.
 */
export async function readVanillaLang(
  minecraftDir: string,
  versionId: string,
  code: unknown
): Promise<
  { ok: true; entries: Record<string, string>; codes: string[] } | { ok: false; error: string }
> {
  if (typeof code !== 'string' || !/^[a-z]{2,3}_[a-z0-9]{2,4}$/.test(code)) {
    return { ok: false, error: tr('Lingua non valida.') }
  }
  const codes = new Set<string>(['en_us'])
  let bytes: Uint8Array | null = null
  try {
    const versionJson = JSON.parse(
      await readFile(join(minecraftDir, 'versions', versionId, `${versionId}.json`), 'utf8')
    ) as { assetIndex?: { id?: unknown }; assets?: unknown }
    const indexId = versionJson.assetIndex?.id ?? versionJson.assets
    if (typeof indexId === 'string' && /^[\w.-]+$/.test(indexId)) {
      const index = JSON.parse(
        await readFile(join(minecraftDir, 'assets', 'indexes', `${indexId}.json`), 'utf8')
      ) as { objects?: Record<string, { hash?: unknown }> }
      for (const [name, entry] of Object.entries(index.objects ?? {})) {
        const m = /^minecraft\/lang\/([a-z]{2,3}_[a-z0-9]{2,4})\.json$/.exec(name)
        if (!m) continue
        codes.add(m[1]!)
        if (m[1] === code && typeof entry.hash === 'string' && /^[0-9a-f]{40}$/.test(entry.hash)) {
          bytes = await readFile(
            join(minecraftDir, 'assets', 'objects', entry.hash.slice(0, 2), entry.hash)
          ).catch(() => null)
        }
      }
    }
    if (code === 'en_us') {
      const jar = await readFile(join(minecraftDir, 'versions', versionId, `${versionId}.jar`))
      const path = 'assets/minecraft/lang/en_us.json'
      bytes = unzipSync(jar, { filter: (file) => file.name === path })[path] ?? null
    }
  } catch {
    // Missing files: handled below.
  }
  if (!bytes) return { ok: false, error: tr('Testi di {0} non trovati per questa versione.', code) }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const entries: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') entries[key] = value
    }
    return { ok: true, entries, codes: [...codes].sort() }
  } catch {
    return { ok: false, error: tr('Testi di {0} non leggibili.', code) }
  }
}
