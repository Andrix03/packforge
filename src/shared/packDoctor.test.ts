import { describe, expect, it } from 'vitest'
import {
  brokenReferences,
  diffTextures,
  lintPaths,
  missingTextures,
  renamePlan
} from './packDoctor'

const B = 'assets/minecraft/textures/block/'

describe('diffTextures', () => {
  it('finds added, removed, changed and renamed (by pixels) textures', () => {
    const before = new Map([
      [`${B}grass_path_top.png`, 'h-path'],
      [`${B}stone.png`, 'h-stone'],
      [`${B}old.png`, 'h-old'],
      [`${B}blank_a.png`, 'h-blank']
    ])
    const after = new Map([
      [`${B}dirt_path_top.png`, 'h-path'],
      [`${B}stone.png`, 'h-stone-2'],
      [`${B}new.png`, 'h-new'],
      // Two new textures with the same pixels as a removed one: ambiguous, no rename.
      [`${B}blank_b.png`, 'h-blank'],
      [`${B}blank_c.png`, 'h-blank']
    ])
    expect(diffTextures(before, after)).toEqual({
      added: [`${B}blank_b.png`, `${B}blank_c.png`, `${B}new.png`],
      removed: [`${B}blank_a.png`, `${B}old.png`],
      renamed: [{ from: `${B}grass_path_top.png`, to: `${B}dirt_path_top.png` }],
      changed: [`${B}stone.png`]
    })
  })
})

describe('renamePlan', () => {
  it('moves a texture with its maps and .mcmeta files, never over an existing file', () => {
    const files = new Set([
      `${B}grass_path_top.png`,
      `${B}grass_path_top.png.mcmeta`,
      `${B}grass_path_top_n.png`,
      `${B}grass_path_top_s.png`,
      `${B}dirt_path_top_s.png`
    ])
    const plan = renamePlan(files, [
      { from: `${B}grass_path_top.png`, to: `${B}dirt_path_top.png` }
    ])
    expect(plan.steps.map((s) => s.to)).toEqual([
      `${B}dirt_path_top.png`,
      `${B}dirt_path_top.png.mcmeta`,
      `${B}dirt_path_top_n.png`
    ])
    expect(plan.blocked).toEqual([
      { from: `${B}grass_path_top_s.png`, to: `${B}dirt_path_top_s.png` }
    ])
  })
})

describe('missingTextures', () => {
  it('groups the game textures the pack does not replace by folder', () => {
    const game = [`${B}stone.png`, `${B}dirt.png`, 'assets/minecraft/textures/item/apple.png']
    const missing = missingTextures(game, new Set([`${B}stone.png`]))
    expect(Object.fromEntries(missing)).toEqual({
      block: [`${B}dirt.png`],
      item: ['assets/minecraft/textures/item/apple.png']
    })
  })
})

describe('lintPaths', () => {
  it('finds names and folders the game skips silently', () => {
    const issues = lintPaths([
      `${B}Stone.png`,
      `${B}my stone.png`,
      'assets/minecraft/textures/blocks/stone.png',
      'assets/pack.png',
      'assets/.DS_Store',
      `${B}stone.png`,
      'pack.mcmeta'
    ])
    expect(issues.map((i) => i.path)).toEqual([
      `${B}Stone.png`,
      `${B}my stone.png`,
      'assets/minecraft/textures/blocks/stone.png',
      'assets/pack.png'
    ])
    expect(issues[2]!.message).toContain('textures/block/')
  })
})

describe('brokenReferences', () => {
  const have = new Set([
    'assets/minecraft/textures/block/stone.png',
    'assets/minecraft/models/block/cube_all.json',
    'assets/minecraft/models/block/stone.json',
    'assets/minecraft/models/item/apple.json'
  ])
  const exists = (path: string) => have.has(path)

  it('finds missing textures and models in models, states and item definitions', () => {
    const files = new Map<string, unknown>([
      [
        'assets/minecraft/models/block/ruby.json',
        { parent: 'block/cube_all', textures: { all: 'block/ruby', particle: '#all' } }
      ],
      [
        'assets/minecraft/blockstates/ruby.json',
        { variants: { '': [{ model: 'block/ruby' }, { model: 'block/ruby_2' }] } }
      ],
      [
        'assets/minecraft/items/ruby.json',
        {
          model: {
            type: 'minecraft:select',
            cases: [],
            fallback: { type: 'model', model: 'item/ruby' }
          }
        }
      ],
      [
        'assets/minecraft/models/block/fine.json',
        { parent: 'block/cube_all', textures: { all: 'block/stone' } }
      ],
      ['assets/minecraft/models/block/broken.json', null]
    ])
    const inPack = (path: string) => exists(path) || files.has(path)
    const issues = brokenReferences(files, inPack).map(
      (i) => `${i.path.split('/').slice(-2).join('/')}: ${i.message}`
    )
    expect(issues).toEqual([
      'block/ruby.json: Usa texture block/ruby, che non esiste: in gioco appare viola e nero.',
      'blockstates/ruby.json: Usa modello block/ruby_2, che non esiste: in gioco appare viola e nero.',
      'items/ruby.json: Usa modello item/ruby, che non esiste: in gioco appare viola e nero.',
      'block/broken.json: JSON non valido: il gioco ignora il file.'
    ])
  })
})
