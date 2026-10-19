import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT } from '../shared/exportPlan'
import { decodePng, encodePng } from '../shared/pngCodec'
import {
  buildExport,
  checkExport,
  defaultExportDir,
  readProject,
  saveProject,
  writeListing
} from './exporter'

let dir: string
let pack: string
const B = 'assets/minecraft/textures/block/'

const png = (size: number, value: number) =>
  encodePng({ width: size, height: size, data: new Uint8Array(size * size * 4).fill(value) })

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'packforge-export-'))
  pack = join(dir, 'My Pack')
  await mkdir(join(pack, ...B.split('/')), { recursive: true })
  await writeFile(
    join(pack, 'pack.mcmeta'),
    JSON.stringify({ pack: { pack_format: 46, description: 'x' } })
  )
  await writeFile(join(pack, ...`${B}stone.png`.split('/')), png(16, 120))
  await writeFile(join(pack, ...`${B}stone_n.png`.split('/')), png(16, 128))
  await writeFile(join(pack, ...`${B}magma.png`.split('/')), png(16, 90))
  await writeFile(
    join(pack, ...`${B}magma.png.mcmeta`.split('/')),
    '{"animation":{"width":16,"height":8}}'
  )
  await writeFile(join(pack, ...`${B}stone.psd`.split('/')), 'work file')
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const source = () => ({ kind: 'folder', root: pack }) as const
const options = (extra = {}) => ({
  packName: 'My Pack',
  info: { ...DEFAULT_PROJECT, author: 'Andrea', version: '1.2.0' },
  variant: { kind: 'full' } as const,
  dir: join(dir, 'out'),
  overwrite: false,
  ...extra
})

describe('project file', () => {
  it('round-trips only valid data', async () => {
    expect(await saveProject(pack, { version: '2.0', license: 'nope', author: 'A' })).toEqual({
      ok: true
    })
    expect(await readProject(pack)).toMatchObject({
      version: '2.0',
      license: 'all-rights-reserved',
      author: 'A'
    })
  })
})

describe('checkExport', () => {
  it('finds vanilla copies by pixels, stray files and a missing icon', async () => {
    const vanilla = {
      kind: 'zip',
      root: join(dir, 'v.jar'),
      // Same pixels as the pack's stone.png (different bytes would not matter).
      data: zipSync({ [`${B}stone.png`]: png(16, 120), [`${B}magma.png`]: png(16, 1) })
    } as const
    const check = await checkExport(source(), vanilla)
    expect(check.vanillaCopies).toEqual([`${B}stone.png`])
    expect(check.errors.some((e) => e.includes('identiche'))).toBe(true)
    expect(check.stray.map((s) => s.path)).toEqual([`${B}stone.psd`])
    expect(check.warnings.some((w) => w.includes('pack.png'))).toBe(true)
  })
})

describe('buildExport', () => {
  it('zips the pack with license, credits and changelog, without stray files', async () => {
    const result = await buildExport(source(), options())
    if (!result.ok) throw new Error(result.error)
    expect(result.path).toBe(join(dir, 'out', 'My-Pack-1.2.0.zip'))
    const entries = unzipSync(await readFile(result.path))
    expect(Object.keys(entries).sort()).toEqual(
      [
        'CHANGELOG.md',
        'CREDITS.txt',
        'LICENSE.txt',
        `${B}magma.png`,
        `${B}magma.png.mcmeta`,
        `${B}stone.png`,
        `${B}stone_n.png`,
        'pack.mcmeta'
      ].sort()
    )
    expect(Buffer.from(entries['CREDITS.txt']!).toString()).toContain(
      'NOT AN OFFICIAL MINECRAFT PRODUCT'
    )
  })

  it('drops the maps without PBR and scales a resolution variant (frames too)', async () => {
    const base = await buildExport(source(), options({ variant: { kind: 'no-pbr' } }))
    if (!base.ok) throw new Error(base.error)
    expect(Object.keys(unzipSync(await readFile(base.path)))).not.toContain(`${B}stone_n.png`)
    const big = await buildExport(
      source(),
      options({ variant: { kind: 'resolution', resolution: 32 } })
    )
    if (!big.ok) throw new Error(big.error)
    const entries = unzipSync(await readFile(big.path))
    const stone = decodePng(entries[`${B}stone.png`]!)
    expect(stone.ok && [stone.image.width, stone.image.height]).toEqual([32, 32])
    expect(JSON.parse(Buffer.from(entries[`${B}magma.png.mcmeta`]!).toString())).toEqual({
      animation: { width: 32, height: 16 }
    })
  })

  it('never overwrites without asking, and never writes inside the pack', async () => {
    expect((await buildExport(source(), options())).ok).toBe(true)
    const again = await buildExport(source(), options())
    expect(again).toMatchObject({ ok: false, exists: true })
    expect((await buildExport(source(), options({ overwrite: true }))).ok).toBe(true)
    expect((await buildExport(source(), options({ dir: join(pack, 'exports') }))).ok).toBe(false)
  })

  it('puts exports next to the pack by default', () => {
    expect(defaultExportDir(join(dir, 'My Pack'))).toBe(join(dir, 'My Pack - export'))
  })
})

describe('writeListing', () => {
  it('writes the upload kit once and keeps edited files', async () => {
    const opts = {
      packName: 'My Pack',
      info: { ...DEFAULT_PROJECT, version: '1.2.0' },
      dir: join(dir, 'out')
    }
    const first = await writeListing(source(), opts)
    if (!first.ok) throw new Error(first.error)
    expect(first.written.sort()).toEqual(['description-en.md', 'description-it.md', 'listing.txt'])
    const en = await readFile(join(first.dir, 'description-en.md'), 'utf8')
    expect(en).toContain('# My Pack')
    expect(en).toContain('16× textures')
    await writeFile(join(first.dir, 'description-en.md'), 'edited by hand')
    const second = await writeListing(source(), opts)
    expect(second.ok && second.kept.length).toBe(3)
    expect(await readFile(join(first.dir, 'description-en.md'), 'utf8')).toBe('edited by hand')
  })
})
