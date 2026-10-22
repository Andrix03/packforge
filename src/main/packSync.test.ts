import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mirrorPack, SYNC_MARKER, syncState, syncTargetFor } from './packSync'

let dir: string
let pack: string
let minecraft: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'packforge-sync-'))
  pack = join(dir, 'My Pack')
  minecraft = join(dir, '.minecraft')
  await mkdir(join(pack, 'assets', 'minecraft', 'textures', 'block'), { recursive: true })
  await writeFile(join(pack, 'pack.mcmeta'), '{}')
  await writeFile(join(pack, 'assets', 'minecraft', 'textures', 'block', 'stone.png'), 'png')
  await writeFile(join(pack, 'assets', 'minecraft', 'textures', 'block', 'x.tmp'), 'temp')
  await mkdir(minecraft)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const source = () => ({ kind: 'folder', root: pack }) as const

async function target() {
  const check = await syncTargetFor(minecraft, source())
  if (!check.ok) throw new Error(check.error)
  return check.target
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false
  )

describe('syncTargetFor', () => {
  it('copies into resourcepacks/<pack folder name>', async () => {
    const t = await target()
    expect(t.path).toBe(join(minecraft, 'resourcepacks', 'My Pack'))
  })

  it('refuses zips and packs already inside resourcepacks', async () => {
    const zip = await syncTargetFor(minecraft, {
      kind: 'zip',
      root: join(dir, 'p.zip'),
      data: new Uint8Array()
    })
    expect(zip.ok).toBe(false)
    const inside = join(minecraft, 'resourcepacks', 'Direct')
    await mkdir(inside, { recursive: true })
    const direct = await syncTargetFor(minecraft, { kind: 'folder', root: inside })
    expect(direct.ok).toBe(false)
  })
})

describe('mirrorPack', () => {
  it('creates the copy with the marker, skipping temp files', async () => {
    const t = await target()
    expect(await syncState(t)).toBe('missing')
    const first = await mirrorPack(source(), t)
    expect(first).toEqual({ ok: true, result: { copied: 2, removed: 0 } })
    expect(await syncState(t)).toBe('ours')
    expect(await readFile(join(t.path, 'pack.mcmeta'), 'utf8')).toBe('{}')
    expect(await exists(join(t.path, 'assets', 'minecraft', 'textures', 'block', 'x.tmp'))).toBe(
      false
    )
  })

  it('copies only what changed and removes what left the pack', async () => {
    const t = await target()
    await mirrorPack(source(), t)
    expect(await mirrorPack(source(), t)).toEqual({ ok: true, result: { copied: 0, removed: 0 } })
    await rm(join(pack, 'assets', 'minecraft', 'textures', 'block', 'stone.png'))
    await writeFile(join(pack, 'pack.mcmeta'), '{"pack":{}}')
    expect(await mirrorPack(source(), t)).toEqual({ ok: true, result: { copied: 1, removed: 1 } })
    expect(await exists(join(t.path, 'assets'))).toBe(false)
    expect(await exists(join(t.path, SYNC_MARKER))).toBe(true)
  })

  it('follows a case-only rename (Stone.png → stone.png) without losing the file', async () => {
    const block = join(pack, 'assets', 'minecraft', 'textures', 'block')
    await rm(join(block, 'stone.png'))
    await writeFile(join(block, 'Stone.png'), 'png')
    const t = await target()
    await mirrorPack(source(), t, true)
    await rm(join(block, 'Stone.png'))
    await writeFile(join(block, 'stone.png'), 'png')
    const result = await mirrorPack(source(), t, true)
    expect(result.ok).toBe(true)
    expect(await readdir(join(t.path, 'assets', 'minecraft', 'textures', 'block'))).toEqual([
      'stone.png'
    ])
  })

  it('leaves hidden folders (.git) out of the copy', async () => {
    await mkdir(join(pack, '.git', 'objects'), { recursive: true })
    await writeFile(join(pack, '.git', 'objects', 'abc'), 'blob')
    const t = await target()
    await mirrorPack(source(), t)
    expect(await exists(join(t.path, '.git'))).toBe(false)
  })

  it('never touches a folder it did not create', async () => {
    const t = await target()
    await mkdir(t.path, { recursive: true })
    await writeFile(join(t.path, 'mine.txt'), 'user file')
    const result = await mirrorPack(source(), t)
    expect(result.ok).toBe(false)
    expect(await readFile(join(t.path, 'mine.txt'), 'utf8')).toBe('user file')
  })
})
