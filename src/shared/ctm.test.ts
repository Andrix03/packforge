import { describe, expect, it } from 'vitest'
import {
  CTM_INDEX,
  CTM_TILE_MASKS,
  ctmTile,
  DOWN,
  DOWN_LEFT,
  DOWN_RIGHT,
  expandTiles,
  horizontalTile,
  isCtmProperties,
  LEFT,
  normalizeMask,
  parseProperties,
  RIGHT,
  serializeProperties,
  tilesFor,
  UP,
  UP_LEFT,
  UP_RIGHT,
  verticalTile
} from './ctm'

const ALL = 255

describe('ctm table', () => {
  it('has 256 entries over the 47 tiles, each tile reachable', () => {
    expect(CTM_INDEX).toHaveLength(256)
    expect(new Set(CTM_INDEX).size).toBe(47)
    expect(Math.max(...CTM_INDEX)).toBe(46)
    expect(CTM_TILE_MASKS.every((m) => m >= 0)).toBe(true)
  })

  it('matches the known template cases', () => {
    expect(ctmTile(0)).toBe(0)
    expect(ctmTile(RIGHT)).toBe(1)
    expect(ctmTile(LEFT | RIGHT)).toBe(2)
    expect(ctmTile(LEFT)).toBe(3)
    expect(ctmTile(DOWN)).toBe(12)
    expect(ctmTile(UP | DOWN)).toBe(24)
    expect(ctmTile(UP)).toBe(36)
    expect(ctmTile(ALL)).toBe(26)
  })

  it('ignores a corner unless both of its edges connect', () => {
    expect(normalizeMask(UP_LEFT)).toBe(0)
    expect(normalizeMask(UP | LEFT | UP_LEFT)).toBe(UP | LEFT | UP_LEFT)
    expect(ctmTile(LEFT | DOWN_LEFT)).toBe(ctmTile(LEFT))
    // The table itself agrees: unreachable corner bits do not change the tile.
    for (let mask = 0; mask < 256; mask++)
      expect(CTM_INDEX[mask]).toBe(CTM_INDEX[normalizeMask(mask)])
  })

  it('distinguishes the four inner corners of a fully connected tile', () => {
    const edges = UP | DOWN | LEFT | RIGHT
    const tiles = [UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT].map((missing) =>
      ctmTile(edges | ((UP_LEFT | UP_RIGHT | DOWN_LEFT | DOWN_RIGHT) & ~missing))
    )
    expect(new Set(tiles).size).toBe(4)
    expect(tiles).not.toContain(26)
  })
})

describe('horizontal / vertical', () => {
  it('picks the 4 tiles', () => {
    expect([0, RIGHT, LEFT | RIGHT, LEFT].map(horizontalTile)).toEqual([3, 0, 1, 2])
    expect([0, UP, UP | DOWN, DOWN].map(verticalTile)).toEqual([3, 0, 1, 2])
  })
})

describe('properties', () => {
  it('parses keys, comments, separators and line joins', () => {
    const p = parseProperties(
      '# comment\nmethod=ctm\nmatchBlocks: glass\ntiles=0-3 \\\n  5\n! other\n'
    )
    expect(p.get('method')).toBe('ctm')
    expect(p.get('matchBlocks')).toBe('glass')
    expect(p.get('tiles')).toBe('0-3 5')
  })

  it('serializes in order with a comment', () => {
    expect(
      serializeProperties(
        [
          ['method', 'ctm'],
          ['tiles', '0-46']
        ],
        'made by PackForge'
      )
    ).toBe('# made by PackForge\nmethod=ctm\ntiles=0-46\n')
  })

  it('expands tiles', () => {
    expect(expandTiles('0-2 5 name <skip> full/path/x.png')).toEqual([
      '0.png',
      '1.png',
      '2.png',
      '5.png',
      'name.png',
      '<skip>',
      'full/path/x.png'
    ])
  })

  it('knows the tile counts', () => {
    const none = new Map<string, string>()
    expect(tilesFor('ctm', none)).toBe(47)
    expect(tilesFor('ctm_compact', none)).toBe(5)
    expect(tilesFor('horizontal', none)).toBe(4)
    expect(tilesFor('overlay', none)).toBe(17)
    expect(
      tilesFor(
        'repeat',
        new Map([
          ['width', '3'],
          ['height', '2']
        ])
      )
    ).toBe(6)
    expect(tilesFor('random', none)).toBeNull()
  })

  it('recognizes CTM files', () => {
    expect(isCtmProperties('assets/minecraft/optifine/ctm/glass/glass.properties')).toBe(true)
    expect(isCtmProperties('assets/minecraft/textures/block/glass.png')).toBe(false)
  })
})
