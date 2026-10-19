import {
  copyFile,
  mkdir,
  readdir,
  realpath,
  rm,
  rmdir,
  stat,
  utimes,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { isIgnoredWatchPath } from './changeBatcher'
import { listPackFiles, type PackSource } from './packSource'

// Copy of a folder pack into `<.minecraft>/resourcepacks/<name>`, kept in step (mirror).
//
// Why a copy and not a link: in 26.3 every symbolic link in resourcepacks is checked against
// `.minecraft/allowed_symlinks.txt` (PackDetector → DirectoryValidator) and ignored when not
// allowed; editing the user's allow-list is not ours to do. A copy always loads.
//
// Safety: the target is always inside `resourcepacks`, and PackForge only writes into a folder it
// created (it holds SYNC_MARKER). A folder of the same name without the marker is never touched.

export const SYNC_MARKER = '.packforge-copy'

export type SyncState = 'missing' | 'ours' | 'foreign'

export interface SyncTarget {
  resourcepacks: string
  path: string
  name: string
}

export type SyncCheck = { ok: true; target: SyncTarget } | { ok: false; error: string }

/** Where a folder pack is copied, or why it cannot be. */
export async function syncTargetFor(minecraftDir: string, source: PackSource): Promise<SyncCheck> {
  if (source.kind !== 'folder') {
    return {
      ok: false,
      error:
        'I pack zip non si copiano: mettili tu nella cartella resourcepacks (o estraili in una cartella).'
    }
  }
  if (!isAbsolute(minecraftDir)) return { ok: false, error: 'Cartella .minecraft non valida.' }
  const resourcepacks = join(minecraftDir, 'resourcepacks')
  const name = basename(source.root)
  try {
    const root = await realpath(source.root)
    const packs = await realpath(resourcepacks).catch(() => null)
    if (packs && isInside(root, packs)) {
      return {
        ok: false,
        error:
          'Il pack è già nella cartella resourcepacks: in gioco si vede direttamente, non serve copiarlo.'
      }
    }
  } catch {
    return { ok: false, error: 'Cartella del pack non trovata.' }
  }
  return { ok: true, target: { resourcepacks, path: join(resourcepacks, name), name } }
}

function isInside(path: string, folder: string): boolean {
  const rel = relative(folder, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export async function syncState(target: SyncTarget): Promise<SyncState> {
  try {
    await stat(target.path)
  } catch {
    return 'missing'
  }
  try {
    await stat(join(target.path, SYNC_MARKER))
    return 'ours'
  } catch {
    return 'foreign'
  }
}

export interface MirrorResult {
  copied: number
  removed: number
}

/**
 * Makes `target` an exact copy of the folder pack (changed files copied, files gone from the pack
 * removed). Refuses a target PackForge did not create.
 */
export async function mirrorPack(
  source: PackSource,
  target: SyncTarget
): Promise<{ ok: true; result: MirrorResult } | { ok: false; error: string }> {
  if (source.kind !== 'folder') return { ok: false, error: 'Solo i pack in cartella.' }
  const state = await syncState(target)
  if (state === 'foreign') {
    return {
      ok: false,
      error: `In resourcepacks c’è già una cartella «${target.name}» che PackForge non ha creato: non la tocco. Rinominala o spostala.`
    }
  }
  await mkdir(target.path, { recursive: true })
  // The target must really be inside resourcepacks (no link redirecting it elsewhere).
  const packs = await realpath(target.resourcepacks)
  const real = await realpath(target.path)
  if (!isInside(real, packs) || real === packs) {
    return { ok: false, error: 'La cartella di destinazione non è dentro resourcepacks.' }
  }
  if (state === 'missing') {
    await writeFile(
      join(real, SYNC_MARKER),
      'Copia creata da PackForge: viene aggiornata e può essere cancellata.\n'
    )
  }

  const { files } = await listPackFiles(source)
  // Hidden folders (.git, .idea…) and temp files never go into the game folder.
  const wanted = files.filter(
    (path) => !isIgnoredWatchPath(path) && !path.split('/').some((part) => part.startsWith('.'))
  )
  const keep = new Set(wanted)
  let copied = 0
  for (const path of wanted) {
    const from = join(source.root, ...path.split('/'))
    const to = join(real, ...path.split('/'))
    const [a, b] = await Promise.all([stat(from), stat(to).catch(() => null)])
    if (b && b.size === a.size && Math.abs(b.mtimeMs - a.mtimeMs) < 2) continue
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
    await utimes(to, a.atime, a.mtime)
    copied++
  }
  let removed = 0
  for (const path of await listFolder(real)) {
    if (path === SYNC_MARKER || keep.has(path)) continue
    await rm(join(real, ...path.split('/')), { force: true })
    removed++
  }
  await removeEmptyFolders(real)
  return { ok: true, result: { copied, removed } }
}

/** Every file under `root` (posix, relative), links not followed. */
async function listFolder(root: string): Promise<string[]> {
  const out: string[] = []
  const pending = ['']
  while (pending.length > 0) {
    const dir = pending.pop()!
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory()) pending.push(path)
      else out.push(path)
    }
  }
  return out
}

async function removeEmptyFolders(root: string): Promise<void> {
  const visit = async (dir: string): Promise<boolean> => {
    const entries = await readdir(dir, { withFileTypes: true })
    let empty = true
    for (const entry of entries) {
      if (entry.isDirectory() && (await visit(join(dir, entry.name)))) {
        await rmdir(join(dir, entry.name))
      } else {
        empty = false
      }
    }
    return empty
  }
  await visit(root)
}
