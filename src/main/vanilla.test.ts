import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listPackFiles } from './packSource'
import {
  listInstalledVersions,
  loadVanillaJar,
  readJarFormat,
  VANILLA_TEXTURES_PREFIX
} from './vanilla'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let mc: string

function jar(versionJson: unknown): Uint8Array {
  return zipSync({
    'version.json': strToU8(JSON.stringify(versionJson)),
    'net/minecraft/Main.class': strToU8('class'),
    assets: {
      minecraft: {
        textures: { block: { 'stone.png': PNG } },
        lang: { 'en_us.json': strToU8('{}') }
      }
    }
  })
}

async function install(id: string, manifest: object, jarBytes: Uint8Array | null): Promise<void> {
  const dir = join(mc, 'versions', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, `${id}.json`), JSON.stringify(manifest))
  if (jarBytes) await writeFile(join(dir, `${id}.jar`), jarBytes)
}

beforeEach(async () => {
  mc = await mkdtemp(join(tmpdir(), 'packforge-mc-'))
  const v263 = { pack_version: { resource_major: 97, resource_minor: 1, data_major: 121 } }
  await install(
    '26.3',
    { id: '26.3', type: 'release', releaseTime: '2026-09-15T11:23:02+00:00' },
    jar(v263)
  )
  await install(
    '26.4-snapshot-4',
    { id: '26.4-snapshot-4', type: 'snapshot', releaseTime: '2026-10-13T12:05:46+00:00' },
    jar({ pack_version: { resource_major: 100, resource_minor: 1 } })
  )
  // Modded profile without its own jar.
  await install('fabric-loader-26.3', { id: 'fabric-loader-26.3', inheritsFrom: '26.3' }, null)
  // Outside the versions folder: must never be loadable.
  await writeFile(join(mc, 'evil.jar'), jar({}))
})

afterEach(async () => {
  await rm(mc, { recursive: true, force: true })
})

describe('listInstalledVersions', () => {
  it('lists versions with a jar, newest first', async () => {
    expect(await listInstalledVersions(mc)).toEqual([
      { id: '26.4-snapshot-4', type: 'snapshot' },
      { id: '26.3', type: 'release' }
    ])
  })

  it('returns an empty list when .minecraft is missing', async () => {
    expect(await listInstalledVersions(join(mc, 'missing'))).toEqual([])
  })
})

describe('loadVanillaJar', () => {
  it('loads an installed jar and reads its resource format', async () => {
    const result = await loadVanillaJar(mc, '26.3')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.resourceFormat).toEqual({ major: 97, minor: 1 })
    const { files } = await listPackFiles(result.source, VANILLA_TEXTURES_PREFIX)
    expect(files).toEqual(['assets/minecraft/textures/block/stone.png'])
  })

  it.each(['fabric-loader-26.3', '../evil', '..\\evil', '', 42, null])(
    'refuses %j (not an installed jar)',
    async (id) => {
      expect((await loadVanillaJar(mc, id)).ok).toBe(false)
    }
  )
})

describe('readJarFormat', () => {
  it('reads current and legacy version.json formats', () => {
    expect(readJarFormat(jar({ pack_version: { resource_major: 97, resource_minor: 1 } }))).toEqual(
      {
        major: 97,
        minor: 1
      }
    )
    expect(readJarFormat(jar({ pack_version: 15 }))).toEqual({ major: 15, minor: 0 })
  })

  it('returns null when version.json is missing or odd', () => {
    expect(readJarFormat(jar({}))).toBeNull()
    expect(readJarFormat(zipSync({ 'a.txt': strToU8('x') }))).toBeNull()
    expect(readJarFormat(strToU8('not a zip'))).toBeNull()
  })
})
