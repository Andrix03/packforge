import { describe, expect, it } from 'vitest'
import { buildFileTree, findFolder, parentPath } from './fileTree'

const PATHS = [
  'pack.mcmeta',
  'pack.png',
  'assets/minecraft/textures/block/stone.png',
  'assets/minecraft/textures/block/stone_n.png',
  'assets/minecraft/textures/item/stick.png',
  'assets/minecraft/models/block/stone.json'
]

describe('buildFileTree', () => {
  it('nests folders and counts files recursively', () => {
    const root = buildFileTree(PATHS)
    expect(root.path).toBe('')
    expect(root.files).toEqual(['pack.mcmeta', 'pack.png'])
    expect(root.totalFiles).toBe(6)

    const textures = findFolder(root, 'assets/minecraft/textures')
    expect(textures?.folders.map((f) => f.name)).toEqual(['block', 'item'])
    expect(textures?.totalFiles).toBe(3)
    expect(findFolder(root, 'assets/minecraft/textures/block')?.files).toEqual([
      'stone.png',
      'stone_n.png'
    ])
  })

  it('sorts naturally and case-insensitively', () => {
    const root = buildFileTree(['b/x.png', 'a10/x.png', 'a2/x.png', 'B2.png', 'a1.png'])
    expect(root.folders.map((f) => f.name)).toEqual(['a2', 'a10', 'b'])
    expect(root.files).toEqual(['a1.png', 'B2.png'])
  })

  it('handles an empty list', () => {
    expect(buildFileTree([])).toEqual({ name: '', path: '', folders: [], files: [], totalFiles: 0 })
  })
})

describe('findFolder / parentPath', () => {
  it('returns null for missing folders', () => {
    expect(findFolder(buildFileTree(PATHS), 'assets/nope')).toBeNull()
  })

  it('computes parent paths', () => {
    expect(parentPath('a/b/c.png')).toBe('a/b')
    expect(parentPath('c.png')).toBe('')
  })
})
