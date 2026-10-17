import { readFile, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join } from 'node:path'
import { unzipSync } from 'fflate'
import type { OpenPackResult, PackSummary } from '../shared/ipc'
import { analyzePackMcmeta } from '../shared/mcmeta'

const MAX_ZIP_BYTES = 1024 ** 3
const MAX_MCMETA_BYTES = 1024 * 1024
const MAX_ICON_BYTES = 4 * 1024 * 1024
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

interface PackFiles {
  mcmeta: Uint8Array
  icon: Uint8Array | null
}

/** Opens a pack folder or zip and analyzes its pack.mcmeta. Read-only. */
export async function openPack(input: unknown): Promise<OpenPackResult> {
  if (typeof input !== 'string' || !isAbsolute(input)) {
    return { ok: false, error: 'Percorso del pack non valido.' }
  }

  let isDirectory: boolean
  try {
    isDirectory = (await stat(input)).isDirectory()
  } catch {
    return { ok: false, error: 'Il percorso non esiste.' }
  }

  let files: PackFiles | string
  let kind: PackSummary['kind']
  if (isDirectory) {
    kind = 'folder'
    files = await readFolderPack(input)
  } else if (extname(input).toLowerCase() === '.zip') {
    kind = 'zip'
    files = await readZipPack(input)
  } else {
    return { ok: false, error: 'Scegli una cartella o un file .zip.' }
  }
  if (typeof files === 'string') return { ok: false, error: files }

  const pack: PackSummary = {
    path: input,
    kind,
    name: kind === 'zip' ? basename(input, extname(input)) : basename(input),
    mcmeta: analyzePackMcmeta(new TextDecoder().decode(files.mcmeta)),
    iconDataUrl: files.icon && isPng(files.icon) ? toPngDataUrl(files.icon) : null
  }
  return { ok: true, pack }
}

async function readFolderPack(dir: string): Promise<PackFiles | string> {
  const mcmetaPath = join(dir, 'pack.mcmeta')
  let mcmetaSize: number
  try {
    mcmetaSize = (await stat(mcmetaPath)).size
  } catch {
    return 'Non è un resource pack: manca pack.mcmeta nella cartella.'
  }
  if (mcmetaSize > MAX_MCMETA_BYTES) return 'pack.mcmeta è troppo grande.'
  const mcmeta = await readFile(mcmetaPath)

  let icon: Uint8Array | null = null
  try {
    const iconPath = join(dir, 'pack.png')
    if ((await stat(iconPath)).size <= MAX_ICON_BYTES) icon = await readFile(iconPath)
  } catch {
    // No icon: fine.
  }
  return { mcmeta, icon }
}

async function readZipPack(path: string): Promise<PackFiles | string> {
  if ((await stat(path)).size > MAX_ZIP_BYTES) return 'Lo zip è troppo grande (massimo 1 GB).'

  const names: string[] = []
  let entries: Record<string, Uint8Array>
  try {
    const data = await readFile(path)
    // Only small root files are decompressed; declared sizes cap the output buffer.
    entries = unzipSync(data, {
      filter: (file) => {
        names.push(file.name)
        if (file.name === 'pack.mcmeta') return file.originalSize <= MAX_MCMETA_BYTES
        if (file.name === 'pack.png') return file.originalSize <= MAX_ICON_BYTES
        return false
      }
    })
  } catch {
    return 'Lo zip è danneggiato o non è un file zip valido.'
  }

  const mcmeta = entries['pack.mcmeta']
  if (!mcmeta) {
    if (names.includes('pack.mcmeta')) return 'pack.mcmeta è troppo grande.'
    const nested = names.find((name) => /^[^/]+\/pack\.mcmeta$/.test(name))
    if (nested) {
      const folder = nested.slice(0, nested.indexOf('/'))
      return `pack.mcmeta è dentro la cartella "${folder}/": Minecraft lo richiede nella radice dello zip.`
    }
    return 'Non è un resource pack: manca pack.mcmeta nello zip.'
  }
  return { mcmeta, icon: entries['pack.png'] ?? null }
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)
}

function toPngDataUrl(bytes: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`
}
