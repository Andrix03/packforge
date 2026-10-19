import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  detectEditors,
  minecraftDirStatus,
  SettingsStore,
  validateEditorPath,
  validateMinecraftDir
} from './settings'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'packforge-settings-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function touch(...parts: string[]): Promise<string> {
  const path = join(root, ...parts)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, '')
  return path
}

describe('SettingsStore', () => {
  it('starts from defaults and persists updates', async () => {
    const file = join(root, 'settings.json')
    const store = new SettingsStore(file)
    expect(await store.get()).toEqual({
      minecraftDir: null,
      externalEditor: null,
      recentPacks: [],
      editorMode: 'beginner',
      palettes: [],
      checkUpdates: true
    })

    await store.update({ minecraftDir: 'D:\\mc' })
    await store.update({ externalEditor: 'C:\\a.exe' })

    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      minecraftDir: 'D:\\mc',
      externalEditor: 'C:\\a.exe',
      recentPacks: [],
      editorMode: 'beginner',
      palettes: [],
      checkUpdates: true
    })
    expect(await new SettingsStore(file).get()).toEqual({
      minecraftDir: 'D:\\mc',
      externalEditor: 'C:\\a.exe',
      recentPacks: [],
      editorMode: 'beginner',
      palettes: [],
      checkUpdates: true
    })
  })

  it('keeps every field when updates run concurrently', async () => {
    const file = join(root, 'settings.json')
    const store = new SettingsStore(file)
    await Promise.all([
      store.update({ minecraftDir: 'D:\\mc' }),
      store.update({ externalEditor: 'C:\\a.exe' })
    ])
    expect(await new SettingsStore(file).get()).toEqual({
      minecraftDir: 'D:\\mc',
      externalEditor: 'C:\\a.exe',
      recentPacks: [],
      editorMode: 'beginner',
      palettes: [],
      checkUpdates: true
    })
  })

  it('modify() sees the latest state, so concurrent list edits are not lost', async () => {
    const file = join(root, 'settings.json')
    const store = new SettingsStore(file)
    const open = (path: string) =>
      store.modify((current) => ({
        recentPacks: [
          { path, name: path, kind: 'folder' as const, openedAt: '2026-10-18T10:00:00Z' },
          ...current.recentPacks
        ]
      }))
    await Promise.all([open('A'), open('B'), open('C')])
    const saved = await new SettingsStore(file).get()
    expect(saved.recentPacks.map((p) => p.path)).toEqual(['C', 'B', 'A'])
  })

  it('recovers from a corrupt file', async () => {
    const file = join(root, 'settings.json')
    await writeFile(file, '{ not json')
    expect(await new SettingsStore(file).get()).toEqual({
      minecraftDir: null,
      externalEditor: null,
      recentPacks: [],
      editorMode: 'beginner',
      palettes: [],
      checkUpdates: true
    })
  })
})

describe('validateMinecraftDir', () => {
  it('accepts existing folders and rejects everything else', async () => {
    expect(await validateMinecraftDir(root)).toBeNull()
    expect(await validateMinecraftDir(join(root, 'missing'))).not.toBeNull()
    expect(await validateMinecraftDir(await touch('file.txt'))).not.toBeNull()
    expect(await validateMinecraftDir('relative')).not.toBeNull()
    expect(await validateMinecraftDir(42)).not.toBeNull()
  })
})

describe('validateEditorPath', () => {
  it('accepts an existing executable', async () => {
    expect(await validateEditorPath(await touch('Editor.exe'))).toBeNull()
  })

  it('rejects folders, missing files and relative paths', async () => {
    expect(await validateEditorPath(join(root, 'Missing.exe'))).not.toBeNull()
    await mkdir(join(root, 'Dir.exe'))
    expect(await validateEditorPath(join(root, 'Dir.exe'))).not.toBeNull()
    expect(await validateEditorPath('Editor.exe')).not.toBeNull()
    expect(await validateEditorPath(null)).not.toBeNull()
  })

  it.runIf(process.platform === 'win32')('requires .exe on Windows', async () => {
    expect(await validateEditorPath(await touch('script.bat'))).not.toBeNull()
  })
})

describe('minecraftDirStatus', () => {
  it('reports versions with jars and the resourcepacks folder', async () => {
    await touch('versions', '26.3', '26.3.jar')
    await writeFile(join(root, 'versions', '26.3', '26.3.json'), '{"type":"release"}')
    await mkdir(join(root, 'resourcepacks'))
    expect(await minecraftDirStatus(root)).toEqual({
      exists: true,
      versionCount: 1,
      hasResourcepacks: true
    })
  })

  it('handles a missing folder', async () => {
    expect(await minecraftDirStatus(join(root, 'nope'))).toEqual({
      exists: false,
      versionCount: 0,
      hasResourcepacks: false
    })
  })
})

describe('detectEditors', () => {
  it('finds installed editors only, newest versioned folder first', async () => {
    const pf = join(root, 'pf')
    const pf86 = join(root, 'pf86')
    await touch('pf', 'Aseprite', 'Aseprite.exe')
    await touch('pf86', 'Steam', 'steamapps', 'common', 'Aseprite', 'Aseprite.exe')
    await touch('pf', 'Adobe', 'Adobe Photoshop 2025', 'Photoshop.exe')
    await touch('pf', 'Adobe', 'Adobe Photoshop 2026', 'Photoshop.exe')
    await mkdir(join(pf, 'Adobe', 'Adobe Photoshop 2024'), { recursive: true }) // no exe
    await touch('pf', 'GIMP 3', 'bin', 'gimp-3.0.exe')
    await touch('pf', 'GIMP 3', 'bin', 'gimp-console-3.0.exe')

    const found = await detectEditors({ programFiles: pf, programFilesX86: pf86 })

    expect(found.map((e) => e.name)).toEqual([
      'Aseprite',
      'Aseprite (Steam)',
      'Photoshop 2026',
      'Photoshop 2025',
      'GIMP 3'
    ])
    expect(found.at(-1)?.path).toBe(join(pf, 'GIMP 3', 'bin', 'gimp-3.0.exe'))
  })

  it('returns nothing without program folders', async () => {
    expect(await detectEditors({})).toEqual([])
  })
})
