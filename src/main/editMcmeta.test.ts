import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editPackObject } from './editMcmeta'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'packforge-edit-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const readMcmeta = async (): Promise<unknown> =>
  JSON.parse(await readFile(join(dir, 'pack.mcmeta'), 'utf8'))

describe('editPackObject', () => {
  it('changes only the requested field and keeps everything else', async () => {
    const original = {
      pack: { description: 'old', min_format: 69, max_format: 97, custom: { keep: true } },
      language: { it_it: { name: 'Italiano', region: 'Italia', bidirectional: false } },
      filter: { block: [{ namespace: 'minecraft', path: 'x' }] }
    }
    await writeFile(join(dir, 'pack.mcmeta'), JSON.stringify(original))

    const result = await editPackObject({ kind: 'folder', root: dir }, (pack) => {
      pack['description'] = '§6Nuovo'
    })

    expect(result).toEqual({ ok: true })
    expect(await readMcmeta()).toEqual({
      ...original,
      pack: { ...original.pack, description: '§6Nuovo' }
    })
  })

  it('reads files with a UTF-8 BOM', async () => {
    await writeFile(join(dir, 'pack.mcmeta'), '\uFEFF{"pack":{"description":"a","pack_format":15}}')
    const result = await editPackObject({ kind: 'folder', root: dir }, (pack) => {
      pack['description'] = 'b'
    })
    expect(result.ok).toBe(true)
    expect(await readMcmeta()).toEqual({ pack: { description: 'b', pack_format: 15 } })
  })

  it('refuses invalid JSON or a missing pack section without touching the file', async () => {
    for (const content of ['{ broken', '{"other": 1}', '{"pack": [1]}']) {
      await writeFile(join(dir, 'pack.mcmeta'), content)
      const result = await editPackObject({ kind: 'folder', root: dir }, () => undefined)
      expect(result.ok).toBe(false)
      expect(await readFile(join(dir, 'pack.mcmeta'), 'utf8')).toBe(content)
    }
  })

  it('two edits at the same time both land (each reads what the other wrote)', async () => {
    await writeFile(join(dir, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 15 } }))
    const source = { kind: 'folder', root: dir } as const
    const results = await Promise.all([
      editPackObject(source, (pack) => {
        pack['description'] = 'new'
      }),
      editPackObject(source, (pack) => {
        pack['pack_format'] = 34
      })
    ])
    expect(results.every((r) => r.ok)).toBe(true)
    expect(await readMcmeta()).toEqual({ pack: { pack_format: 34, description: 'new' } })
  })

  it('refuses zip packs', async () => {
    const result = await editPackObject(
      { kind: 'zip', root: join(dir, 'p.zip'), data: zipSync({}) },
      () => undefined
    )
    expect(result.ok).toBe(false)
  })
})
