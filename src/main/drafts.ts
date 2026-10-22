import { createHash } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { decodePng, encodePng, MAX_IMAGE_PIXELS, MAX_IMAGE_SIDE } from '../shared/pngCodec'
import { writeFileAtomic } from './atomicWrite'
import { isSafePackPath } from './packSource'

// Unsaved editor work, kept OUTSIDE the pack (in the app's user data) so a crash or a forgotten
// save never loses it and never leaves stray files in the pack. One draft per pack texture.

export interface Draft {
  /** ISO timestamp of the last autosave. */
  savedAt: string
  width: number
  height: number
  rgba: Uint8Array
}

interface DraftMeta {
  packRoot: string
  path: string
  savedAt: string
}

export type DraftResult = { ok: true } | { ok: false; error: string }

export class DraftStore {
  constructor(
    private readonly dir: string,
    private readonly caseInsensitive = process.platform === 'win32'
  ) {}

  async save(
    packRoot: string,
    path: unknown,
    width: unknown,
    height: unknown,
    rgba: unknown,
    now = new Date()
  ): Promise<DraftResult> {
    if (typeof path !== 'string' || !isSafePackPath(path) || !path.toLowerCase().endsWith('.png')) {
      return { ok: false, error: 'Percorso della texture non valido.' }
    }
    if (!isSide(width) || !isSide(height) || width * height > MAX_IMAGE_PIXELS) {
      return { ok: false, error: 'Dimensioni della texture non valide.' }
    }
    if (!(rgba instanceof Uint8Array) || rgba.length !== width * height * 4) {
      return { ok: false, error: 'Dati della texture non validi.' }
    }
    const base = this.base(packRoot, path)
    const meta: DraftMeta = { packRoot: resolve(packRoot), path, savedAt: now.toISOString() }
    try {
      await mkdir(this.dir, { recursive: true })
      await writeFileAtomic(`${base}.png`, encodePng({ width, height, data: rgba }))
      await writeFileAtomic(`${base}.json`, JSON.stringify(meta))
      return { ok: true }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { ok: false, error: `Impossibile salvare la bozza: ${detail}` }
    }
  }

  /** The draft for this texture, or null (missing, unreadable, or for another file). */
  async load(packRoot: string, path: unknown): Promise<Draft | null> {
    if (typeof path !== 'string' || !isSafePackPath(path)) return null
    const base = this.base(packRoot, path)
    try {
      const meta = JSON.parse(await readFile(`${base}.json`, 'utf8')) as Partial<DraftMeta>
      // Guard against hash collisions and hand-edited files.
      if (meta.path !== path || !this.samePath(meta.packRoot ?? '', resolve(packRoot))) return null
      const decoded = decodePng(await readFile(`${base}.png`))
      if (!decoded.ok) return null
      const { width, height, data } = decoded.image
      return { savedAt: String(meta.savedAt), width, height, rgba: data }
    } catch {
      return null
    }
  }

  async discard(packRoot: string, path: unknown): Promise<void> {
    if (typeof path !== 'string' || !isSafePackPath(path)) return
    const base = this.base(packRoot, path)
    await Promise.all([rm(`${base}.png`, { force: true }), rm(`${base}.json`, { force: true })])
  }

  private base(packRoot: string, path: string): string {
    const root = resolve(packRoot)
    const id = `${this.caseInsensitive ? root.toLowerCase() : root}\0${path}`
    return join(this.dir, createHash('sha256').update(id).digest('hex').slice(0, 32))
  }

  private samePath(a: string, b: string): boolean {
    return this.caseInsensitive ? a.toLowerCase() === b.toLowerCase() : a === b
  }
}

function isSide(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_IMAGE_SIDE
}
