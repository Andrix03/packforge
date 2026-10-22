import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DraftStore } from './drafts'

let dir: string
let store: DraftStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'packforge-drafts-'))
  store = new DraftStore(join(dir, 'drafts'), true)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const PACK = 'C:\\Packs\\MyPack'
const PATH = 'assets/minecraft/textures/block/stone.png'
const RGBA = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 255])

describe('DraftStore', () => {
  it('saves and loads a draft exactly', async () => {
    const now = new Date('2026-10-18T10:00:00Z')
    expect(await store.save(PACK, PATH, 2, 1, RGBA, {}, now)).toEqual({ ok: true })
    const draft = await store.load(PACK, PATH)
    expect(draft?.savedAt).toBe(now.toISOString())
    expect(draft && [...draft.rgba]).toEqual([...RGBA])
    expect(draft?.width).toBe(2)
  })

  it('keeps drafts of different textures and packs apart', async () => {
    await store.save(PACK, PATH, 2, 1, RGBA)
    expect(await store.load(PACK, 'assets/minecraft/textures/block/dirt.png')).toBeNull()
    expect(await store.load('C:\\Packs\\Other', PATH)).toBeNull()
  })

  it('treats Windows pack paths case-insensitively', async () => {
    await store.save(PACK, PATH, 2, 1, RGBA)
    expect(await store.load('c:\\packs\\mypack', PATH)).not.toBeNull()
  })

  it('discards both files', async () => {
    await store.save(PACK, PATH, 2, 1, RGBA)
    await store.discard(PACK, PATH)
    expect(await store.load(PACK, PATH)).toBeNull()
    expect(await readdir(join(dir, 'drafts'))).toEqual([])
  })

  it('validates what the renderer sends', async () => {
    expect((await store.save(PACK, '../x.png', 2, 1, RGBA)).ok).toBe(false)
    expect((await store.save(PACK, PATH, 3, 1, RGBA)).ok).toBe(false)
    expect((await store.save(PACK, PATH, 2, 1, 'nope')).ok).toBe(false)
    expect(await store.load(PACK, '../x.png')).toBeNull()
  })

  it('ignores a corrupt draft', async () => {
    await store.save(PACK, PATH, 2, 1, RGBA)
    const files = await readdir(join(dir, 'drafts'))
    await writeFile(
      join(
        dir,
        'drafts',
        files.find((f) => f.endsWith('.png'))!
      ),
      'garbage'
    )
    expect(await store.load(PACK, PATH)).toBeNull()
  })

  it('keeps painted maps with the draft, drops them when a later draft has none', async () => {
    const normal = { width: 2, height: 1, rgba: Uint8Array.from([128, 128, 255, 9, 1, 1, 1, 1]) }
    expect(await store.save(PACK, PATH, 2, 1, RGBA, { normal })).toEqual({ ok: true })
    const draft = await store.load(PACK, PATH)
    expect(draft?.maps.normal && [...draft.maps.normal.rgba]).toEqual([...normal.rgba])
    expect(draft?.maps.specular).toBeUndefined()
    await store.save(PACK, PATH, 2, 1, RGBA, {})
    expect((await store.load(PACK, PATH))?.maps).toEqual({})
    await store.discard(PACK, PATH)
    expect(await readdir(join(dir, 'drafts'))).toEqual([])
  })

  it('refuses maps that are not what they claim', async () => {
    const bad = [
      { emission: { width: 1, height: 1, rgba: new Uint8Array(4) } },
      { normal: { width: 2, height: 1, rgba: new Uint8Array(4) } },
      { normal: 'x' },
      [1]
    ]
    for (const maps of bad) expect((await store.save(PACK, PATH, 2, 1, RGBA, maps)).ok).toBe(false)
  })
})
