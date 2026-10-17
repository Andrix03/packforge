import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readIconSource, writePackIcon } from './packIcon'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'packforge-icon-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'latin1')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return bytes
}

describe('readIconSource', () => {
  it('returns a data URL with the right type', async () => {
    const path = join(dir, 'Logo.JPG')
    await writeFile(path, 'jpegbytes')
    const result = await readIconSource(path)
    expect(result).toEqual({
      ok: true,
      name: 'Logo.JPG',
      dataUrl: `data:image/jpeg;base64,${Buffer.from('jpegbytes').toString('base64')}`
    })
  })

  it('rejects unsupported types and missing files', async () => {
    expect((await readIconSource(join(dir, 'icon.bmp')))?.ok).toBe(false)
    expect((await readIconSource(join(dir, 'missing.png')))?.ok).toBe(false)
  })
})

describe('writePackIcon', () => {
  it('writes a valid square PNG as pack.png', async () => {
    const png = pngHeader(128, 128)
    expect(await writePackIcon({ kind: 'folder', root: dir }, png.toString('base64'))).toEqual({
      ok: true
    })
    expect(await readFile(join(dir, 'pack.png'))).toEqual(png)
  })

  it('rejects bad data without touching an existing icon', async () => {
    await writeFile(join(dir, 'pack.png'), 'old')
    for (const data of [42, 'not base64!', pngHeader(64, 32).toString('base64'), '']) {
      expect((await writePackIcon({ kind: 'folder', root: dir }, data)).ok).toBe(false)
    }
    expect(await readFile(join(dir, 'pack.png'), 'utf8')).toBe('old')
  })

  it('refuses zip packs', async () => {
    const result = await writePackIcon(
      { kind: 'zip', root: join(dir, 'p.zip'), data: zipSync({}) },
      pngHeader(64, 64).toString('base64')
    )
    expect(result.ok).toBe(false)
  })
})
