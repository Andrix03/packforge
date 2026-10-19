import { describe, expect, it } from 'vitest'
import {
  curseforgeTags,
  descriptionMarkdown,
  factsFromFiles,
  listingText,
  modrinthResolution,
  modrinthTags,
  summaryText
} from './listing'

const T = 'assets/minecraft/textures/'
const files = [
  'pack.mcmeta',
  `${T}block/stone.png`,
  `${T}block/stone_n.png`,
  `${T}block/stone_s.png`,
  `${T}block/magma.png`,
  `${T}block/magma.png.mcmeta`,
  `${T}item/diamond.png`,
  `${T}gui/widgets.png`,
  'assets/minecraft/optifine/ctm/glass/glass.properties',
  'assets/minecraft/models/block/stone.json'
]
const widths = new Map([
  [`${T}block/stone.png`, 32],
  [`${T}block/magma.png`, 32],
  [`${T}item/diamond.png`, 32],
  [`${T}gui/widgets.png`, 256]
])
const facts = factsFromFiles(files, widths, {
  name: 'My Pack',
  author: 'Andrea',
  version: '1.2.0',
  license: 'CC BY-NC-SA 4.0',
  gameVersions: ['1.21.11 – 26.3']
})

describe('factsFromFiles', () => {
  it('reads resolution, PBR, CTM, animation and folders', () => {
    expect(facts).toMatchObject({
      resolution: 32,
      textures: 4,
      pbr: 1,
      ctm: true,
      animated: 1,
      models: true
    })
    expect(facts.folders).toEqual(['block', 'gui', 'item'])
  })
})

describe('tags', () => {
  it('maps sizes to Modrinth resolution tags', () => {
    expect([8, 16, 24, 32, 100, 512, null].map(modrinthResolution)).toEqual([
      '8x-',
      '16x',
      '16x',
      '32x',
      '128x',
      '512x+',
      null
    ])
  })

  it('suggests Modrinth features and CurseForge categories', () => {
    expect(modrinthTags(facts)).toEqual(['32x', 'blocks', 'items', 'gui', 'models'])
    expect(curseforgeTags(facts)).toEqual(['32x', 'Animated'])
  })
})

describe('texts', () => {
  it('writes a short summary and full descriptions with the disclaimer', () => {
    const summary = summaryText(facts, 'en')
    expect(summary.length).toBeLessThanOrEqual(250)
    expect(summary).toContain('LabPBR')
    expect(summary).toContain('1 animated texture.')
    expect(descriptionMarkdown(facts, 'it')).toContain('1 texture animata')
    const en = descriptionMarkdown(facts, 'en')
    expect(en).toContain('# My Pack')
    expect(en).toContain('needs Continuity')
    expect(en).toContain('1.21.11 – 26.3')
    expect(en).toContain('NOT AN OFFICIAL MINECRAFT PRODUCT')
    expect(descriptionMarkdown(facts, 'it')).toContain('Texture connesse')
    expect(listingText(facts, 'My-Pack-1.2.0.zip')).toContain('Modrinth tags: 32x, blocks')
  })
})
