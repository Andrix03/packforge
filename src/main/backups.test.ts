import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BackupStore, MAX_BACKUPS_PER_PACK } from './backups'

let dir: string
let pack: string
let store: BackupStore
const A = 'assets/minecraft/textures/block/a.png'
const B = 'assets/minecraft/textures/block/b.png'

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'packforge-backup-'))
  pack = join(dir, 'pack')
  await mkdir(join(pack, 'assets', 'minecraft', 'textures', 'block'), { recursive: true })
  await writeFile(join(pack, ...A.split('/')), 'original a')
  store = new BackupStore(join(dir, 'backups'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const read = (path: string) => readFile(join(pack, ...path.split('/')), 'utf8')
const exists = (path: string) =>
  stat(join(pack, ...path.split('/'))).then(
    () => true,
    () => false
  )

describe('BackupStore', () => {
  it('copies existing files, lists created ones, restores both', async () => {
    const made = await store.create(pack, 'Applica in blocco', [A, B])
    expect(made.ok).toBe(true)
    // The operation overwrites a and creates b.
    await writeFile(join(pack, ...A.split('/')), 'changed a')
    await writeFile(join(pack, ...B.split('/')), 'new b')
    const [info] = await store.list(pack)
    expect(info).toMatchObject({ label: 'Applica in blocco', saved: 1, created: 1 })
    const restored = await store.restore(pack, info!.id)
    expect(restored).toEqual({ ok: true, restored: 1, removed: 1 })
    expect(await read(A)).toBe('original a')
    expect(await exists(B)).toBe(false)
  })

  it('takes a backup before restoring, so a restore can be undone', async () => {
    const first = await store.create(pack, 'op', [A])
    await writeFile(join(pack, ...A.split('/')), 'changed a')
    if (!first.ok) throw new Error(first.error)
    await store.restore(pack, first.id)
    const list = await store.list(pack)
    expect(list[0]?.label).toBe('Prima di ripristinare «op»')
    await store.restore(pack, list[0]!.id)
    expect(await read(A)).toBe('changed a')
  })

  it('refuses unsafe paths and ids, and keeps packs apart', async () => {
    expect((await store.create(pack, 'x', ['../outside.png'])).ok).toBe(false)
    expect((await store.restore(pack, '../../etc')).ok).toBe(false)
    const other = join(dir, 'other')
    await mkdir(other)
    await store.create(pack, 'mine', [A])
    expect(await store.list(other)).toEqual([])
  })

  it('keeps only the newest backups of a pack', async () => {
    for (let i = 0; i < MAX_BACKUPS_PER_PACK + 3; i++) {
      await store.create(pack, `op ${i}`, [A], new Date(Date.UTC(2026, 0, 1, 0, 0, i)))
    }
    const list = await store.list(pack)
    expect(list).toHaveLength(MAX_BACKUPS_PER_PACK)
    expect(list[0]?.label).toBe(`op ${MAX_BACKUPS_PER_PACK + 2}`)
  })

  it('restoring the oldest of a full list works (its own backup does not prune it)', async () => {
    for (let i = 0; i < MAX_BACKUPS_PER_PACK; i++) {
      await writeFile(join(pack, ...A.split('/')), `version ${i}`)
      await store.create(pack, `op ${i}`, [A], new Date(Date.UTC(2026, 0, 1, 0, 0, i)))
    }
    await writeFile(join(pack, ...A.split('/')), 'latest')
    const oldest = (await store.list(pack)).at(-1)
    expect(oldest?.label).toBe('op 0')
    const result = await store.restore(pack, oldest?.id)
    expect(result).toMatchObject({ ok: true, restored: 1 })
    expect(await read(A)).toBe('version 0')
    const after = await store.list(pack)
    expect(after[0]?.label).toBe('Prima di ripristinare «op 0»')
    // The restored backup is pruned on the next backup, like any other old one.
    await store.create(pack, 'next', [A])
    expect((await store.list(pack)).length).toBe(MAX_BACKUPS_PER_PACK)
  })
})
