import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { unzipSync } from 'fflate'
import type { VanillaVersionInfo } from '../shared/ipc'
import type { PackVersion } from '../shared/packFormat'
import type { PackSource } from './packSource'
import { tr } from '../shared/i18n'

// Vanilla textures are read from the user's own client jar, in memory, for
// reference only. Nothing from the jar is ever written to disk or a pack.

/** Jar folders exposed as reference: textures plus the models/states that use them. */
export const VANILLA_ASSET_PREFIXES = [
  'assets/minecraft/textures/',
  'assets/minecraft/models/',
  'assets/minecraft/blockstates/'
] as const
const MAX_JAR_BYTES = 512 * 1024 * 1024

/** Default `.minecraft` location for the official launcher. */
export function defaultMinecraftDir(): string {
  if (process.platform === 'win32') {
    return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), '.minecraft')
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'minecraft')
  }
  return join(homedir(), '.minecraft')
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
    return {
      ok: true,
      source: { kind: 'zip', root: jarPath, data },
      resourceFormat: readJarFormat(data)
    }
  } catch {
    return { ok: false, error: tr('Impossibile leggere il jar di {0}.', version.id) }
  }
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
