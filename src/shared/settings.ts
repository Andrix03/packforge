// User settings persisted by main in `<userData>/settings.json`.

export interface Settings {
  /** Custom `.minecraft` folder; null means the launcher default. */
  minecraftDir: string | null
  /** Executable used for "open in external editor"; null when not set. */
  externalEditor: string | null
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  minecraftDir: null,
  externalEditor: null
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
    externalEditor: nonEmptyString(record['externalEditor'])
  }
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
