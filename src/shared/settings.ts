// User settings persisted by main in `<userData>/settings.json`.

export interface Settings {
  /** Custom `.minecraft` folder; null means the launcher default. */
  minecraftDir: string | null
  /** Executable used for "open in external editor"; null when not set. */
  externalEditor: string | null
  /** Most recently opened packs, newest first. */
  recentPacks: RecentPack[]
}

export interface RecentPack {
  path: string
  name: string
  kind: 'folder' | 'zip'
  /** ISO timestamp of the last open. */
  openedAt: string
}

export interface RecentPackStatus extends RecentPack {
  /** False when the folder/zip was moved or deleted. */
  exists: boolean
}

export const MAX_RECENT_PACKS = 10

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  minecraftDir: null,
  externalEditor: null,
  recentPacks: []
})

/**
 * Reads settings from untrusted JSON (a hand-edited or older file).
 * Unknown fields are dropped; invalid fields fall back to defaults.
 */
export function parseSettings(value: unknown): Settings {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
  return {
    minecraftDir: nonEmptyString(record['minecraftDir']),
    externalEditor: nonEmptyString(record['externalEditor']),
    recentPacks: Array.isArray(record['recentPacks'])
      ? record['recentPacks'].filter(isRecentPack).slice(0, MAX_RECENT_PACKS)
      : []
  }
}

function isRecentPack(value: unknown): value is RecentPack {
  if (typeof value !== 'object' || value === null) return false
  const { path, name, kind, openedAt } = value as Record<string, unknown>
  return (
    nonEmptyString(path) !== null &&
    typeof name === 'string' &&
    (kind === 'folder' || kind === 'zip') &&
    typeof openedAt === 'string'
  )
}

/** Same pack path? Windows paths are case-insensitive. */
export function samePackPath(a: string, b: string, caseInsensitive: boolean): boolean {
  return caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** Puts `entry` first, removing older entries for the same path, capped at the max. */
export function addRecentPack(
  list: readonly RecentPack[],
  entry: RecentPack,
  caseInsensitive: boolean
): RecentPack[] {
  return [entry, ...list.filter((p) => !samePackPath(p.path, entry.path, caseInsensitive))].slice(
    0,
    MAX_RECENT_PACKS
  )
}

export function removeRecentPack(
  list: readonly RecentPack[],
  path: string,
  caseInsensitive: boolean
): RecentPack[] {
  return list.filter((p) => !samePackPath(p.path, path, caseInsensitive))
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

/** A known image editor found on this machine. */
export interface DetectedEditor {
  name: string
  path: string
}

export interface MinecraftDirStatus {
  exists: boolean
  /** Installed versions that have a client jar. */
  versionCount: number
  hasResourcepacks: boolean
}

/** Everything the settings screen shows, computed by main. */
export interface SettingsView {
  settings: Settings
  defaultMinecraftDir: string
  /** `settings.minecraftDir ?? defaultMinecraftDir`. */
  effectiveMinecraftDir: string
  minecraft: MinecraftDirStatus
  /** Whether the configured editor still exists on disk (true when none is set). */
  externalEditorExists: boolean
  detectedEditors: DetectedEditor[]
}

/** Display name for an editor path, e.g. `C:\…\Aseprite.exe` → `Aseprite`. */
export function editorDisplayName(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? path
  return file.replace(/\.(exe|app)$/i, '')
}
