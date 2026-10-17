import { describe, expect, it } from 'vitest'
import {
  addRecentPack,
  DEFAULT_SETTINGS,
  editorDisplayName,
  MAX_RECENT_PACKS,
  parseSettings,
  removeRecentPack,
  type RecentPack
} from './settings'

describe('parseSettings', () => {
  it('reads valid settings', () => {
    expect(
      parseSettings({
        minecraftDir: 'D:\\Games\\.minecraft',
        externalEditor: 'C:\\A\\Aseprite.exe'
      })
    ).toEqual({
      minecraftDir: 'D:\\Games\\.minecraft',
      externalEditor: 'C:\\A\\Aseprite.exe',
      recentPacks: []
    })
  })

  it.each([null, undefined, 'text', 42, []])('falls back to defaults for %j', (value) => {
    expect(parseSettings(value)).toEqual(DEFAULT_SETTINGS)
  })

  it('drops invalid and unknown fields', () => {
    expect(parseSettings({ minecraftDir: 5, externalEditor: '   ', theme: 'dark' })).toEqual(
      DEFAULT_SETTINGS
    )
  })
})

describe('editorDisplayName', () => {
  it('strips folders and executable extensions', () => {
    expect(editorDisplayName('C:\\Program Files\\Aseprite\\Aseprite.exe')).toBe('Aseprite')
    expect(editorDisplayName('/Applications/Krita.app')).toBe('Krita')
    expect(editorDisplayName('gimp')).toBe('gimp')
  })
})

describe('recent packs', () => {
  const entry = (path: string, openedAt = '2026-10-18T10:00:00Z'): RecentPack => ({
    path,
    name: path.split('\\').pop() ?? path,
    kind: 'folder',
    openedAt
  })

  it('puts the newest first and removes duplicates (case-insensitive on Windows)', () => {
    const list = [entry('C:\\packs\\A'), entry('C:\\packs\\B')]
    expect(addRecentPack(list, entry('c:\\PACKS\\b'), true).map((p) => p.path)).toEqual([
      'c:\\PACKS\\b',
      'C:\\packs\\A'
    ])
    expect(addRecentPack(list, entry('c:\\PACKS\\b'), false)).toHaveLength(3)
  })

  it('keeps at most MAX_RECENT_PACKS', () => {
    let list: RecentPack[] = []
    for (let i = 0; i < MAX_RECENT_PACKS + 5; i++) {
      list = addRecentPack(list, entry(`C:\\p${i}`), true)
    }
    expect(list).toHaveLength(MAX_RECENT_PACKS)
    expect(list[0]?.path).toBe(`C:\\p${MAX_RECENT_PACKS + 4}`)
  })

  it('removes by path', () => {
    const list = [entry('C:\\A'), entry('C:\\B')]
    expect(removeRecentPack(list, 'c:\\a', true).map((p) => p.path)).toEqual(['C:\\B'])
  })

  it('parses only valid entries from settings JSON', () => {
    const parsed = parseSettings({
      recentPacks: [entry('C:\\A'), { path: '', name: 'x', kind: 'folder', openedAt: '' }, 'bad']
    })
    expect(parsed.recentPacks.map((p) => p.path)).toEqual(['C:\\A'])
    expect(parseSettings({ recentPacks: 'nope' }).recentPacks).toEqual([])
  })
})
