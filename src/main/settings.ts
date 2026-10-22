import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'
import {
  DEFAULT_SETTINGS,
  parseSettings,
  type DetectedEditor,
  type MinecraftDirStatus,
  type Settings
} from '../shared/settings'
import { listInstalledVersions } from './vanilla'
import { writeFileAtomic } from './atomicWrite'

/** Settings persisted as JSON; writes are atomic (temp file + rename) and serialized. */
export class SettingsStore {
  private cache: Settings | null = null
  private writing: Promise<unknown> = Promise.resolve()

  constructor(private readonly file: string) {}

  async get(): Promise<Settings> {
    if (this.cache) return this.cache
    try {
      this.cache = parseSettings(JSON.parse(await readFile(this.file, 'utf8')))
    } catch {
      // Missing or corrupt file: start from defaults, the next save rewrites it.
      this.cache = { ...DEFAULT_SETTINGS }
    }
    return this.cache
  }

  update(patch: Partial<Settings>): Promise<Settings> {
    return this.modify(() => patch)
  }

  /** Read-modify-write: `change` receives the latest saved state. */
  async modify(change: (current: Settings) => Partial<Settings>): Promise<Settings> {
    // The next state is computed inside the queue, so concurrent updates
    // each start from the previous one instead of overwriting it.
    const run = this.writing.then(async () => {
      const current = await this.get()
      const next = { ...current, ...change(current) }
      await writeFileAtomic(this.file, `${JSON.stringify(next, null, 2)}\n`)
      this.cache = next
      return next
    })
    this.writing = run.catch(() => undefined)
    return run
  }
}

/** Validates a user-chosen `.minecraft` folder. Returns an Italian error or null. */
export async function validateMinecraftDir(path: unknown): Promise<string | null> {
  if (typeof path !== 'string' || !isAbsolute(path)) return 'Percorso non valido.'
  try {
    if (!(await stat(path)).isDirectory()) return 'Il percorso non è una cartella.'
  } catch {
    return 'La cartella non esiste.'
  }
  return null
}

/** Validates an editor executable. Returns an Italian error or null. */
export async function validateEditorPath(path: unknown): Promise<string | null> {
  if (typeof path !== 'string' || !isAbsolute(path)) return 'Percorso non valido.'
  if (process.platform === 'win32' && extname(path).toLowerCase() !== '.exe') {
    return 'Scegli un programma .exe.'
  }
  try {
    if (!(await stat(path)).isFile()) return 'Il percorso non è un file.'
  } catch {
    return 'Il programma non esiste.'
  }
  return null
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

export async function minecraftDirStatus(dir: string): Promise<MinecraftDirStatus> {
  const isDir = async (path: string): Promise<boolean> => {
    try {
      return (await stat(path)).isDirectory()
    } catch {
      return false
    }
  }
  const exists = await isDir(dir)
  return {
    exists,
    versionCount: exists ? (await listInstalledVersions(dir)).length : 0,
    hasResourcepacks: exists && (await isDir(join(dir, 'resourcepacks')))
  }
}

export interface ProgramRoots {
  programFiles?: string | undefined
  programFilesX86?: string | undefined
}

/**
 * Finds common pixel-art / image editors in their standard Windows install
 * folders. Candidates are only suggestions: each one is checked on disk.
 */
export async function detectEditors(roots: ProgramRoots): Promise<DetectedEditor[]> {
  const pf = roots.programFiles
  const pf86 = roots.programFilesX86
  const candidates: DetectedEditor[] = []
  const add = (name: string, ...parts: Array<string | undefined>): void => {
    if (parts.every((part): part is string => typeof part === 'string')) {
      candidates.push({ name, path: join(...parts) })
    }
  }

  add('Aseprite', pf, 'Aseprite', 'Aseprite.exe')
  add('Aseprite (Steam)', pf86, 'Steam', 'steamapps', 'common', 'Aseprite', 'Aseprite.exe')
  add('Aseprite (Steam)', pf, 'Steam', 'steamapps', 'common', 'Aseprite', 'Aseprite.exe')
  add('Krita', pf, 'Krita (x64)', 'bin', 'krita.exe')
  add('Paint.NET', pf, 'paint.net', 'paintdotnet.exe')
  if (pf) {
    // Versioned folders: "Adobe Photoshop 2026", "GIMP 3", … newest name first.
    for (const dir of await subdirsStartingWith(join(pf, 'Adobe'), 'Adobe Photoshop')) {
      add(dir.replace(/^Adobe /, ''), pf, 'Adobe', dir, 'Photoshop.exe')
    }
    for (const dir of await subdirsStartingWith(pf, 'GIMP')) {
      for (const exe of await filesMatching(join(pf, dir, 'bin'), /^gimp(-\d+(\.\d+)*)?\.exe$/i)) {
        add(dir, pf, dir, 'bin', exe)
      }
    }
  }

  const found: DetectedEditor[] = []
  for (const candidate of candidates) {
    if (!found.some((f) => f.path === candidate.path) && (await fileExists(candidate.path))) {
      found.push(candidate)
    }
  }
  return found
}

async function subdirsStartingWith(dir: string, prefix: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
      .map((e) => e.name)
      .sort()
      .reverse()
  } catch {
    return []
  }
}

async function filesMatching(dir: string, pattern: RegExp): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries.filter((e) => e.isFile() && pattern.test(e.name)).map((e) => e.name)
  } catch {
    return []
  }
}
