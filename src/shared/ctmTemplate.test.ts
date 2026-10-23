import { describe, expect, it } from 'vitest'
import { DOWN, DOWN_RIGHT, LEFT, RIGHT, UP } from './ctm'
import {
  ctmFolderFor,
  ctmPropertiesFor,
  ctmTileImage,
  ctmTiles,
  lineTileIndex,
  methodTiles,
  templateProblem,
  type Image
} from './ctmTemplate'

const FRAME = 200
const INSIDE = 50
const CORNER = 255

/** 6×6 glass: frame 1 px (200), corner pixels 255, inside 50. */
function glass(): Image {
  const size = 6
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edgeX = x === 0 || x === size - 1
      const edgeY = y === 0 || y === size - 1
      const v = edgeX && edgeY ? CORNER : edgeX || edgeY ? FRAME : INSIDE
      data.set([v, v, v, 255], (y * size + x) * 4)
    }
  }
  return { width: size, height: size, data }
}

const at = (tile: Uint8ClampedArray, x: number, y: number): number => tile[(y * 6 + x) * 4]!

describe('ctmTileImage', () => {
  const source = glass()
  const tile = (mask: number): Uint8ClampedArray => ctmTileImage(source, null, mask, { border: 1 })

  it('keeps the whole frame when nothing connects', () => {
    expect([...tile(0)]).toEqual([...new Uint8ClampedArray(source.data)])
  })

  it('removes the frame on a connected side and runs the other bands through the corner', () => {
    const right = tile(RIGHT)
    expect(at(right, 5, 2)).toBe(INSIDE) // right band gone
    expect(at(right, 0, 2)).toBe(FRAME) // left band kept
    expect(at(right, 5, 0)).toBe(FRAME) // top band runs on (no corner pixel)
    expect(at(right, 0, 0)).toBe(CORNER) // the far corner stays
  })

  it('leaves an inner corner when both edges connect but not the diagonal', () => {
    const inner = tile(RIGHT | DOWN)
    expect(at(inner, 5, 5)).toBe(CORNER)
    expect(at(inner, 5, 3)).toBe(INSIDE)
    const full = tile(RIGHT | DOWN | DOWN_RIGHT)
    expect(at(full, 5, 5)).toBe(INSIDE)
  })

  it('is all inside when everything connects', () => {
    const all = tile(255)
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) expect(at(all, x, y)).toBe(INSIDE)
  })

  it('uses a separate center texture where the frame is removed', () => {
    const center: Image = { width: 6, height: 6, data: new Uint8Array(144).fill(9) }
    const t = ctmTileImage(source, center, LEFT | UP, { border: 1 })
    expect(at(t, 0, 3)).toBe(9)
    expect(at(t, 3, 3)).toBe(INSIDE) // the middle is still the source's
    expect(at(t, 5, 3)).toBe(FRAME)
  })

  it('makes 47 tiles', () => {
    expect(ctmTiles(source, null, { border: 1 })).toHaveLength(47)
  })
})

describe('line methods (horizontal, vertical)', () => {
  const source = glass()

  it('make 4 tiles in the OptiFine / Continuity order', () => {
    const [start, middle, end, alone] = methodTiles(source, null, { border: 1 }, 'horizontal')
    // 0 = start of a row: open on the right only.
    expect(at(start!, 5, 2)).toBe(INSIDE)
    expect(at(start!, 0, 2)).toBe(FRAME)
    // 1 = middle: open on both sides, top and bottom bands run through.
    expect(at(middle!, 0, 2)).toBe(INSIDE)
    expect(at(middle!, 5, 2)).toBe(INSIDE)
    expect(at(middle!, 0, 0)).toBe(FRAME)
    // 2 = end of a row: open on the left only. 3 = alone: the whole frame.
    expect(at(end!, 0, 2)).toBe(INSIDE)
    expect(at(end!, 5, 2)).toBe(FRAME)
    expect([...alone!]).toEqual([...new Uint8ClampedArray(source.data)])
  })

  it('vertical opens above for the bottom of a column and below for the top', () => {
    const [bottom, , top] = methodTiles(source, null, { border: 1 }, 'vertical')
    expect(at(bottom!, 2, 0)).toBe(INSIDE)
    expect(at(bottom!, 2, 5)).toBe(FRAME)
    expect(at(top!, 2, 5)).toBe(INSIDE)
    expect(at(top!, 2, 0)).toBe(FRAME)
  })

  it('pick the tile from the two neighbours like Continuity', () => {
    expect(lineTileIndex(false, false)).toBe(3)
    expect(lineTileIndex(true, false)).toBe(2)
    expect(lineTileIndex(false, true)).toBe(0)
    expect(lineTileIndex(true, true)).toBe(1)
  })

  it('write method and 4 tiles in the properties', () => {
    const { entries } = ctmPropertiesFor(
      'assets/minecraft/textures/block/bookshelf.png',
      'horizontal'
    )
    expect(entries).toContainEqual(['method', 'horizontal'])
    expect(entries).toContainEqual(['tiles', '0-3'])
    expect(ctmPropertiesFor('assets/minecraft/textures/block/glass.png').entries).toContainEqual([
      'tiles',
      '0-46'
    ])
  })
})

describe('naming', () => {
  it('names the properties and the folder after the texture', () => {
    expect(ctmPropertiesFor('assets/minecraft/textures/block/glass.png').tileName).toBe('glass')
    expect(ctmPropertiesFor('assets/mod/textures/block/wall.png').tileName).toBe('mod:block/wall')
    expect(ctmFolderFor('assets/minecraft/textures/block/glass.png')).toBe(
      'assets/minecraft/optifine/ctm/glass'
    )
  })

  it('refuses non-square sources', () => {
    expect(templateProblem({ width: 16, height: 48 })).toContain('quadrata')
    expect(templateProblem({ width: 16, height: 16 })).toBeNull()
  })
})
