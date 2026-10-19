import { mkdir, mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decodePng } from '../shared/pngCodec'
import { saveCtmProperties, saveTexture, saveTextureMcmeta } from './textureFile'

let dir: string
let pack: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'packforge-texture-'))
  pack = join(dir, 'pack')
  await mkdir(pack)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const PATH = 'assets/minecraft/textures/block/stone.png'
const RGBA = Uint8Array.from([255, 0, 0, 255, 0, 0, 255, 77])

describe('saveTexture', () => {
  it('writes an exact PNG, creating missing folders', async () => {
    const result = await saveTexture({ kind: 'folder', root: pack }, PATH, 2, 1, RGBA)
    expect(result).toEqual({ ok: true })
    const decoded = decodePng(await readFile(join(pack, ...PATH.split('/'))))
    expect(decoded.ok && [...decoded.image.data]).toEqual([...RGBA])
    // No temp file left behind.
    expect(await readdir(join(pack, 'assets/minecraft/textures/block'))).toEqual(['stone.png'])
  })

  it('refuses zip packs', async () => {
    const result = await saveTexture(
      { kind: 'zip', root: join(dir, 'p.zip'), data: new Uint8Array() },
      PATH,
      2,
      1,
      RGBA
    )
    expect(result.ok).toBe(false)
  })

  it.each([
    ['../outside.png'],
    ['assets/../../outside.png'],
    ['/abs.png'],
    ['assets\\x.png'],
    ['assets/stone.txt'],
    [42]
  ])('rejects the path %j', async (path) => {
    const result = await saveTexture({ kind: 'folder', root: pack }, path, 2, 1, RGBA)
    expect(result).toEqual({ ok: false, error: 'Percorso della texture non valido.' })
  })

  it('rejects wrong sizes and data', async () => {
    const source = { kind: 'folder', root: pack } as const
    expect((await saveTexture(source, PATH, 0, 1, RGBA)).ok).toBe(false)
    expect((await saveTexture(source, PATH, 1.5, 1, RGBA)).ok).toBe(false)
    expect((await saveTexture(source, PATH, 3, 1, RGBA)).ok).toBe(false)
    expect((await saveTexture(source, PATH, 2, 1, [1, 2, 3])).ok).toBe(false)
  })

  it('does not follow a folder link that leaves the pack', async () => {
    const outside = join(dir, 'outside')
    await mkdir(outside)
    // Junctions need no admin rights on Windows.
    await symlink(outside, join(pack, 'assets'), 'junction')
    const result = await saveTexture({ kind: 'folder', root: pack }, 'assets/x.png', 2, 1, RGBA)
    expect(result).toEqual({ ok: false, error: 'Percorso della texture non valido.' })
    const nested = await saveTexture({ kind: 'folder', root: pack }, 'assets/sub/x.png', 2, 1, RGBA)
    expect(nested.ok).toBe(false)
    // Nothing was created through the link, not even the folder.
    expect(await readdir(outside)).toEqual([])
  })
})

describe('saveTextureMcmeta', () => {
  const MCMETA = `${PATH}.mcmeta`

  it('writes the JSON next to the texture and deletes it with null', async () => {
    const source = { kind: 'folder', root: pack } as const
    const json = '{\n  "animation": { "frametime": 2 }\n}\n'
    expect(await saveTextureMcmeta(source, PATH, json)).toEqual({ ok: true })
    expect(await readFile(join(pack, ...MCMETA.split('/')), 'utf8')).toBe(json)
    expect(await saveTextureMcmeta(source, PATH, null)).toEqual({ ok: true })
    await expect(readFile(join(pack, ...MCMETA.split('/')))).rejects.toThrow()
  })

  it('rejects non-objects, bad paths and zip packs', async () => {
    const source = { kind: 'folder', root: pack } as const
    expect((await saveTextureMcmeta(source, PATH, '[1, 2]')).ok).toBe(false)
    expect((await saveTextureMcmeta(source, PATH, 'not json')).ok).toBe(false)
    expect((await saveTextureMcmeta(source, '../x.png', '{}')).ok).toBe(false)
    expect((await saveTextureMcmeta(source, 'a/b.txt', '{}')).ok).toBe(false)
    const zip = { kind: 'zip', root: join(dir, 'p.zip'), data: new Uint8Array() } as const
    expect((await saveTextureMcmeta(zip, PATH, '{}')).ok).toBe(false)
  })
})

describe('saveCtmProperties', () => {
  const CTM = 'assets/minecraft/optifine/ctm/glass/glass.properties'

  it('writes the text under optifine/ctm', async () => {
    const source = { kind: 'folder', root: pack } as const
    expect(await saveCtmProperties(source, CTM, 'method=ctm\n')).toEqual({ ok: true })
    expect(await readFile(join(pack, ...CTM.split('/')), 'utf8')).toBe('method=ctm\n')
  })

  it('rejects other folders, escapes, binary content and zip packs', async () => {
    const source = { kind: 'folder', root: pack } as const
    const write = (path: string, content: unknown) => saveCtmProperties(source, path, content)
    expect((await write('assets/minecraft/textures/x.properties', 'a=b')).ok).toBe(false)
    expect((await write('assets/minecraft/optifine/ctm/../../x.properties', 'a=b')).ok).toBe(false)
    expect((await write('assets/minecraft/optifine/ctm/a.txt', 'a=b')).ok).toBe(false)
    expect((await write(CTM, 'a\u0000b')).ok).toBe(false)
    expect((await write(CTM, 42)).ok).toBe(false)
    const zip = { kind: 'zip', root: join(dir, 'p.zip'), data: new Uint8Array() } as const
    expect((await saveCtmProperties(zip, CTM, 'a=b')).ok).toBe(false)
  })
})
