import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isSafePackPath, listPackFiles, readPackPng, type PackSource } from './packSource'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let root: string
let packDir: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'packforge-source-'))
  packDir = join(root, 'pack')
  await mkdir(join(packDir, 'assets', 'minecraft', 'textures', 'block'), { recursive: true })
  await writeFile(join(packDir, 'pack.mcmeta'), '{}')
  await writeFile(join(packDir, 'assets', 'minecraft', 'textures', 'block', 'stone.png'), PNG)
  await writeFile(join(packDir, 'assets', 'minecraft', 'textures', 'block', 'notes.txt'), 'x')
  // A secret outside the pack that must never be readable.
  await mkdir(join(root, 'outside'))
  await writeFile(join(root, 'outside', 'secret.png'), PNG)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const folder = (): PackSource => ({ kind: 'folder', root: packDir })
const zip = (): PackSource => ({
  kind: 'zip',
  root: join(root, 'pack.zip'),
  data: zipSync({
    'pack.mcmeta': strToU8('{}'),
    assets: { minecraft: { textures: { block: { 'stone.png': PNG, 'notes.txt': strToU8('x') } } } }
  })
})

describe('isSafePackPath', () => {
  it.each(['pack.png', 'assets/minecraft/textures/block/stone.png', '..foo/bar.png'])(
    'accepts %j',
    (path) => expect(isSafePackPath(path)).toBe(true)
  )

  it.each([
    '',
    '/abs.png',
    '../x.png',
    'a/../../x.png',
    'a/./b.png',
    'a//b.png',
    'a\\b.png',
    'a\0.png'
  ])('rejects %j', (path) => expect(isSafePackPath(path)).toBe(false))
})

describe('listPackFiles', () => {
  const expected = [
    'assets/minecraft/textures/block/notes.txt',
    'assets/minecraft/textures/block/stone.png',
    'pack.mcmeta'
  ]

  it('lists folder files recursively with posix paths', async () => {
    expect(await listPackFiles(folder())).toEqual({ files: expected, truncated: false })
  })

  it('lists zip entries without directories', async () => {
    expect(await listPackFiles(zip())).toEqual({ files: expected, truncated: false })
  })

  it('skips unsafe zip entry names', async () => {
    const data = zipSync({ 'pack.mcmeta': strToU8('{}'), '../evil.png': PNG })
    const { files } = await listPackFiles({ kind: 'zip', root: 'x.zip', data })
    expect(files).toEqual(['pack.mcmeta'])
  })

  it('does not follow directory links out of the pack', async () => {
    // Junctions need no admin rights on Windows; plain dir symlinks elsewhere.
    await symlink(join(root, 'outside'), join(packDir, 'link'), 'junction')
    const { files } = await listPackFiles(folder())
    expect(files.some((file) => file.includes('secret'))).toBe(false)
  })
})

describe('readPackPng', () => {
  it.each([
    ['folder', folder],
    ['zip', zip]
  ] as const)('reads PNGs from a %s pack', async (_, source) => {
    expect(await readPackPng(source(), 'assets/minecraft/textures/block/stone.png')).toEqual(
      expect.objectContaining({ length: PNG.length })
    )
  })

  it.each([
    ['folder', folder],
    ['zip', zip]
  ] as const)('refuses non-PNG, missing and traversal paths (%s)', async (_, source) => {
    expect(await readPackPng(source(), 'pack.mcmeta')).toBeNull()
    expect(await readPackPng(source(), 'assets/minecraft/textures/block/notes.txt')).toBeNull()
    expect(await readPackPng(source(), 'missing.png')).toBeNull()
    expect(await readPackPng(source(), '../outside/secret.png')).toBeNull()
  })

  it('refuses files reached through a link that leaves the pack', async () => {
    await symlink(join(root, 'outside'), join(packDir, 'link'), 'junction')
    expect(await readPackPng(folder(), 'link/secret.png')).toBeNull()
  })
})
