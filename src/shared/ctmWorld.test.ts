import { describe, expect, it } from 'vitest'
import { buildQuads, type Quad } from './blockGeometry'
import type { ResolvedModel } from './blockModel'
import { LEFT, parseProperties, RIGHT, UP, UP_LEFT } from './ctm'
import { assignTiles, CULLED, faceAxes, faceMask, findCtmSet, type Vec3 } from './ctmWorld'

function cubeQuads(): Quad[] {
  const texture = { id: 'minecraft:block/glass', translucent: false }
  const face = { uv: null, texture, rotation: 0 as const, tintIndex: -1 }
  const model: ResolvedModel = {
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        rotation: null,
        faces: { down: face, up: face, north: face, south: face, west: face, east: face }
      }
    ],
    ambientOcclusion: true,
    warnings: []
  }
  return buildQuads(model, { x: 0, y: 0 })
}

const quads = cubeQuads()
const facing = (n: Vec3): Quad =>
  quads.find((q) => q.normal.every((v, i) => Math.round(v) === n[i]))!
const south = facing([0, 0, 1])
const up = facing([0, 1, 0])

describe('faceAxes', () => {
  it('reads texture right/down from the quad (south face: right = +X, down = -Y)', () => {
    expect(faceAxes(south)).toEqual({ right: [1, 0, 0], down: [0, -1, 0] })
  })

  it('works for the top face too', () => {
    const axes = faceAxes(up)!
    // The top's texture lies in the XZ plane.
    expect(axes.right[1]).toBe(0)
    expect(axes.down[1]).toBe(0)
  })
})

describe('faceMask', () => {
  const blocks = (list: Vec3[]): ((p: Vec3) => boolean) => {
    const set = new Set(list.map((p) => p.join(',')))
    return (p) => set.has(p.join(','))
  }

  it('connects along a wall in the face plane', () => {
    const wall: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0]
    ]
    expect(faceMask(south, [0, 0, 0], blocks(wall))).toBe(RIGHT | UP)
    // The raw mask keeps the up-left neighbour; ctmTile ignores it (up does not connect).
    expect(faceMask(south, [1, 0, 0], blocks(wall))).toBe(LEFT | UP_LEFT)
  })

  it('does not connect to a neighbour whose face is covered', () => {
    const covered: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1] // in front of the right neighbour's south face
    ]
    expect(faceMask(south, [0, 0, 0], blocks(covered))! & RIGHT).toBe(0)
  })
})

describe('assignTiles', () => {
  it('gives a 3×3 floor the 9 classic top tiles (center 26)', () => {
    const floor: Vec3[] = []
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) floor.push([x, 0, z])
    const topIndex = quads.indexOf(up)
    const tiles = assignTiles(floor, quads, 'ctm').map((t) => t[topIndex])
    expect(tiles[4]).toBe(26)
    expect(new Set(tiles).size).toBe(9)
    // A lone block shows tile 0 on every face.
    expect(assignTiles([[0, 0, 0]], quads, 'ctm')[0]).toEqual(quads.map(() => 0))
  })

  it('uses the 4 horizontal tiles', () => {
    const row: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0]
    ]
    const southIndex = quads.indexOf(south)
    expect(assignTiles(row, quads, 'horizontal').map((t) => t[southIndex])).toEqual([0, 1, 2])
  })
})

describe('findCtmSet', () => {
  const file = (path: string, text: string) => ({ path, properties: parseProperties(text) })
  const ctm = 'assets/minecraft/optifine/ctm/'

  it('matches by matchTiles, file name or block, and resolves the tiles', () => {
    const files = [file(`${ctm}glass/glass.properties`, 'method=ctm\ntiles=0-46')]
    const found = findCtmSet(files, 'assets/minecraft/textures/block/glass.png', null)
    expect(found.set?.tiles).toHaveLength(47)
    expect(found.set?.tiles[0]).toBe(`${ctm}glass/0.png`)
    const byBlock = findCtmSet(
      [file(`${ctm}x/block_stone.properties`, 'method=horizontal\ntiles=0-3')],
      'assets/minecraft/textures/block/other.png',
      'stone'
    )
    expect(byBlock.set?.method).toBe('horizontal')
  })

  it('explains unsupported methods and ignores other textures', () => {
    const files = [file(`${ctm}g/glass.properties`, 'method=overlay\ntiles=0-16')]
    const found = findCtmSet(files, 'assets/minecraft/textures/block/glass.png', null)
    expect(found.set).toBeNull()
    expect('reason' in found && found.reason).toContain('overlay')
    expect(findCtmSet(files, 'assets/minecraft/textures/block/stone.png', null)).toEqual({
      set: null,
      reason: null
    })
  })
})

describe('culling', () => {
  it('hides the faces between two blocks of the same kind', () => {
    const pair: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0]
    ]
    const east = quads.findIndex((q) => Math.round(q.normal[0]) === 1)
    const west = quads.findIndex((q) => Math.round(q.normal[0]) === -1)
    const [left, right] = assignTiles(pair, quads, 'ctm')
    expect(left![east]).toBe(CULLED)
    expect(right![west]).toBe(CULLED)
    expect(left![west]).not.toBe(CULLED)
  })
})

describe('findCtmSet tile counts', () => {
  it('explains a set with too few tiles instead of showing it half done', () => {
    const files = [
      {
        path: 'assets/minecraft/optifine/ctm/glass/glass.properties',
        properties: parseProperties('method=ctm\ntiles=0-3')
      }
    ]
    const found = findCtmSet(files, 'assets/minecraft/textures/block/glass.png', null)
    expect(found.set).toBeNull()
    expect('reason' in found && found.reason).toContain('4 tile')
  })
})
