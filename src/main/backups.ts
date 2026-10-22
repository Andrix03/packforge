import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { isSafePackPath } from './packSource'
import { writePackBytes } from './textureFile'

// Backups taken BEFORE an operation overwrites pack files (batch, variants, resize, CTM, editor
// saves). Kept OUTSIDE the pack, in the app's user data: `<dir>/<pack id>/<backup id>/`
// holds `backup.json` and a copy of every file that existed. Files the operation created are
// listed too, so restoring removes them. Restoring takes a backup first (it can be undone).

export const MAX_BACKUPS_PER_PACK = 50
/** One operation backs up at most this many files (larger ones are refused, not half done). */
export const MAX_FILES_PER_BACKUP = 20_000

export interface BackupInfo {
  id: string
  label: string
  /** ISO timestamp. */
  at: string
  /** Files that existed and were copied. */
  saved: number
  /** Files the operation created (removed on restore). */
  created: number
}

interface Manifest {
  packRoot: string
  label: string
  at: string
  saved: string[]
  created: string[]
}

export type BackupResult = { ok: true; id: string } | { ok: false; error: string }

export class BackupStore {
  /** Backups being restored: never pruned meanwhile (the restore takes a backup of its own). */
  private readonly restoring = new Set<string>()

  constructor(
    private readonly dir: string,
    private readonly caseInsensitive = process.platform === 'win32'
  ) {}

  /** Copies the existing files among `paths` (pack-relative) before they change. */
  async create(
    packRoot: string,
    label: unknown,
    paths: unknown,
    now = new Date()
  ): Promise<BackupResult> {
    if (typeof label !== 'string' || label.length === 0 || label.length > 200) {
      return { ok: false, error: 'Nome del backup non valido.' }
    }
    if (!Array.isArray(paths) || paths.length > MAX_FILES_PER_BACKUP) {
      return { ok: false, error: 'Elenco dei file non valido.' }
    }
    const unique = [...new Set(paths)]
    if (!unique.every((p): p is string => typeof p === 'string' && isSafePackPath(p))) {
      return { ok: false, error: 'Percorso non valido nel backup.' }
    }
    const root = await realpath(packRoot)
    // Sortable and unique enough: time + a short random part.
    const id = `${now.toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}`
    const folder = join(this.packDir(root), id)
    const saved: string[] = []
    const created: string[] = []
    try {
      for (const path of unique) {
        const file = resolve(root, ...path.split('/'))
        const real = await realpath(file).catch(() => null)
        if (real === null) {
          created.push(path)
          continue
        }
        if (!isInside(root, real) || !(await stat(real)).isFile()) continue
        const copy = join(folder, 'files', ...path.split('/'))
        await mkdir(dirname(copy), { recursive: true })
        await copyFile(real, copy)
        saved.push(path)
      }
      const manifest: Manifest = { packRoot: root, label, at: now.toISOString(), saved, created }
      await mkdir(folder, { recursive: true })
      await writeFile(join(folder, 'backup.json'), JSON.stringify(manifest, null, 2))
    } catch (error) {
      await rm(folder, { recursive: true, force: true })
      return {
        ok: false,
        error: `Backup non riuscito: ${error instanceof Error ? error.message : String(error)}`
      }
    }
    await this.prune(root)
    return { ok: true, id }
  }

  /** Newest first. */
  async list(packRoot: string): Promise<BackupInfo[]> {
    const root = await realpath(packRoot).catch(() => resolve(packRoot))
    const ids = await readdir(this.packDir(root)).catch(() => [] as string[])
    const out: BackupInfo[] = []
    for (const id of ids) {
      const manifest = await this.manifest(root, id)
      if (manifest) {
        out.push({
          id,
          label: manifest.label,
          at: manifest.at,
          saved: manifest.saved.length,
          created: manifest.created.length
        })
      }
    }
    return out.sort((a, b) => b.id.localeCompare(a.id))
  }

  /** Puts the files back as they were (and removes the ones the operation created). */
  async restore(
    packRoot: string,
    id: unknown
  ): Promise<{ ok: true; restored: number; removed: number } | { ok: false; error: string }> {
    const root = await realpath(packRoot)
    if (typeof id !== 'string' || !/^[\w-]+$/.test(id))
      return { ok: false, error: 'Backup non valido.' }
    const manifest = await this.manifest(root, id)
    if (!manifest) return { ok: false, error: 'Backup non trovato.' }
    this.restoring.add(id)
    try {
      return await this.restoreFiles(root, id, manifest)
    } finally {
      this.restoring.delete(id)
    }
  }

  private async restoreFiles(
    root: string,
    id: string,
    manifest: Manifest
  ): Promise<{ ok: true; restored: number; removed: number } | { ok: false; error: string }> {
    const before = await this.create(root, `Prima di ripristinare «${manifest.label}»`, [
      ...manifest.saved,
      ...manifest.created
    ])
    if (!before.ok) return before
    let restored = 0
    let removed = 0
    for (const path of manifest.saved) {
      const bytes = await readFile(join(this.packDir(root), id, 'files', ...path.split('/')))
      const written = await writePackBytes(root, path, bytes)
      if (!written.ok) return { ok: false, error: written.error }
      restored++
    }
    for (const path of manifest.created) {
      const real = await realpath(resolve(root, ...path.split('/'))).catch(() => null)
      if (real && isInside(root, real)) {
        await rm(real, { force: true })
        removed++
      }
    }
    return { ok: true, restored, removed }
  }

  async remove(packRoot: string, id: unknown): Promise<void> {
    if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) return
    const root = await realpath(packRoot).catch(() => resolve(packRoot))
    await rm(join(this.packDir(root), id), { recursive: true, force: true })
  }

  private async prune(root: string): Promise<void> {
    const all = await this.list(root)
    // Old backups are dropped first; one being restored is kept (and counts towards the limit).
    for (const old of all.slice(MAX_BACKUPS_PER_PACK)) {
      if (!this.restoring.has(old.id)) await this.remove(root, old.id)
    }
  }

  private async manifest(root: string, id: string): Promise<Manifest | null> {
    try {
      const value = JSON.parse(
        await readFile(join(this.packDir(root), id, 'backup.json'), 'utf8')
      ) as Manifest
      const same = this.caseInsensitive
        ? value.packRoot.toLowerCase() === root.toLowerCase()
        : value.packRoot === root
      const safe = [...value.saved, ...value.created].every(
        (p) => typeof p === 'string' && isSafePackPath(p)
      )
      return same && safe ? value : null
    } catch {
      return null
    }
  }

  private packDir(root: string): string {
    const id = this.caseInsensitive ? root.toLowerCase() : root
    return join(this.dir, createHash('sha256').update(id).digest('hex').slice(0, 32))
  }
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}
