import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPack } from './pack'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'packforge-test-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const request = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  parentDir: root,
  name: 'Test Pack',
  description: 'Un pack di prova',
  gameVersion: '26.3',
  ...overrides
})

describe('createPack', () => {
  it('creates the folder, texture dir and a modern pack.mcmeta', async () => {
    const result = await createPack(request())

    expect(result).toEqual({ ok: true, path: join(root, 'Test Pack') })
    const mcmeta = JSON.parse(await readFile(join(root, 'Test Pack', 'pack.mcmeta'), 'utf8'))
    expect(mcmeta).toEqual({
      pack: { description: 'Un pack di prova', min_format: [97, 1], max_format: 97 }
    })
    expect(
      (await stat(join(root, 'Test Pack', 'assets', 'minecraft', 'textures'))).isDirectory()
    ).toBe(true)
  })

  it('writes the legacy pack_format for old targets', async () => {
    await createPack(request({ gameVersion: '1.20.1' }))
    const mcmeta = JSON.parse(await readFile(join(root, 'Test Pack', 'pack.mcmeta'), 'utf8'))
    expect(mcmeta).toEqual({ pack: { description: 'Un pack di prova', pack_format: 15 } })
  })

  it('refuses to overwrite an existing folder and leaves it untouched', async () => {
    await createPack(request())
    await writeFile(join(root, 'Test Pack', 'keep.txt'), 'mine')

    const result = await createPack(request({ description: 'altro' }))

    expect(result.ok).toBe(false)
    expect(await readFile(join(root, 'Test Pack', 'keep.txt'), 'utf8')).toBe('mine')
    const mcmeta = JSON.parse(await readFile(join(root, 'Test Pack', 'pack.mcmeta'), 'utf8'))
    expect(mcmeta.pack.description).toBe('Un pack di prova')
  })

  it('rejects relative or missing destinations', async () => {
    expect((await createPack(request({ parentDir: 'relative/dir' }))).ok).toBe(false)
    expect((await createPack(request({ parentDir: join(root, 'missing') }))).ok).toBe(false)
  })

  it('rejects untrusted input before touching the disk', async () => {
    expect((await createPack(request({ name: '..\\escape' }))).ok).toBe(false)
    expect((await createPack(null)).ok).toBe(false)
  })
})
