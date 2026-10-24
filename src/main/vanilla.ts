import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import type { VanillaVersionInfo } from '../shared/ipc'
import type { PackVersion } from '../shared/packFormat'
import { isSafePackPath, type PackSource } from './packSource'
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
