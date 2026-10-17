import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openPack } from './openPack'

// Smallest valid PNG signature + IHDR start is enough for the signature check.
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const MCMETA = JSON.stringify({ pack: { description: 'Zip pack', min_format: 69, max_format: 97 } })

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'packforge-open-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function writeZip(name: string, files: Zippable): Promise<string> {
  const path = join(root, name)
  await writeFile(path, zipSync(files))
  return path
}

describe('openPack — folder', () => {
  it('reads pack.mcmeta and the icon', async () => {
    const dir = join(root, 'My Pack')
    await mkdir(dir)
    await writeFile(join(dir, 'pack.mcmeta'), MCMETA)
    await writeFile(join(dir, 'pack.png'), PNG_BYTES)

    const result = await openPack(dir)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pack).toMatchObject({ kind: 'folder', name: 'My Pack', path: dir })
    expect(result.pack.mcmeta.description).toBe('Zip pack')
    expect(result.pack.mcmeta.issues).toEqual([])
    expect(result.pack.iconDataUrl?.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('ignores a pack.png that is not a PNG', async () => {
    await writeFile(join(root, 'pack.mcmeta'), MCMETA)
    await writeFile(join(root, 'pack.png'), 'not a png')
    const result = await openPack(root)
    expect(result.ok && result.pack.iconDataUrl).toBeNull()
  })

  it('reports a folder without pack.mcmeta', async () => {
    const result = await openPack(root)
    expect(result).toMatchObject({ ok: false })
  })

  it('still opens packs with an invalid pack.mcmeta, reporting issues', async () => {
    await writeFile(join(root, 'pack.mcmeta'), '{ broken')
    const result = await openPack(root)
    expect(result.ok && result.pack.mcmeta.issues[0]?.severity).toBe('error')
  })
})

describe('openPack — zip', () => {
  it('reads pack.mcmeta and the icon from the zip root', async () => {
    const path = await writeZip('Cool Pack.zip', {
      'pack.mcmeta': strToU8(MCMETA),
      'pack.png': PNG_BYTES,
      assets: { minecraft: { textures: { block: { 'stone.png': PNG_BYTES } } } }
    })

    const result = await openPack(path)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.pack).toMatchObject({ kind: 'zip', name: 'Cool Pack' })
    expect(result.pack.mcmeta.description).toBe('Zip pack')
    expect(result.pack.iconDataUrl).not.toBeNull()
  })

  it('explains a pack nested inside a folder in the zip', async () => {
    const path = await writeZip('nested.zip', { Inner: { 'pack.mcmeta': strToU8(MCMETA) } })
    const result = await openPack(path)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('"Inner/"')
  })

  it('reports zips without pack.mcmeta and corrupt zips', async () => {
    const empty = await writeZip('empty.zip', { 'readme.txt': strToU8('hi') })
    expect((await openPack(empty)).ok).toBe(false)

    const corrupt = join(root, 'corrupt.zip')
    await writeFile(corrupt, 'definitely not a zip')
    expect((await openPack(corrupt)).ok).toBe(false)
  })

  it('refuses an oversized pack.mcmeta without inflating it', async () => {
    const huge = new Uint8Array(2 * 1024 * 1024).fill(0x20)
    const path = await writeZip('huge.zip', { 'pack.mcmeta': [huge, { level: 9 }] })
    const result = await openPack(path)
    expect(!result.ok && result.error).toContain('troppo grande')
  })
})

describe('openPack — input validation', () => {
  it('rejects non-string, relative, missing and non-zip paths', async () => {
    expect((await openPack(42)).ok).toBe(false)
    expect((await openPack('relative/pack')).ok).toBe(false)
    expect((await openPack(join(root, 'missing'))).ok).toBe(false)
    const txt = join(root, 'pack.txt')
    await writeFile(txt, 'x')
    expect((await openPack(txt)).ok).toBe(false)
  })
})
