import { describe, expect, it } from 'vitest'
import { buildQuads, defaultUv, faceCorners } from './blockGeometry'
import {
  blockstatePath,
  blockstateVariants,
  defaultVariant,
  isBlockJsonPath,
  modelPath,
  resolveModel,
  resolveTextureVariable,
  texturePath,
  type Vec3
} from './blockModel'

// Trimmed copies of real 26.3 vanilla files.
const FILES: Record<string, unknown> = {
  'assets/minecraft/models/block/block.json': { gui_light: 'side' },
  'assets/minecraft/models/block/cube.json': {
    parent: 'block/block',
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: Object.fromEntries(
          ['down', 'up', 'north', 'south', 'west', 'east'].map((d) => [
            d,
            { texture: `#${d}`, cullface: d }
          ])
        )
      }
    ]
  },
  'assets/minecraft/models/block/cube_column.json': {
    parent: 'block/cube',
    textures: {
      particle: '#side',
      down: '#end',
      up: '#end',
      north: '#side',
      east: '#side',
      south: '#side',
      west: '#side'
    }
  },
  'assets/minecraft/models/block/oak_log.json': {
    parent: 'minecraft:block/cube_column',
    textures: { end: 'minecraft:block/oak_log_top', side: 'minecraft:block/oak_log' }
  },
  'assets/minecraft/models/block/glass.json': {
    parent: 'minecraft:block/cube',
    textures: Object.fromEntries(
      ['down', 'up', 'north', 'south', 'west', 'east'].map((d) => [
        d,
        { force_translucent: true, sprite: 'minecraft:block/glass' }
      ])
    )
  },
  'assets/minecraft/models/block/loop_a.json': { parent: 'block/loop_b' },
  'assets/minecraft/models/block/loop_b.json': { parent: 'block/loop_a' }
}
const load = async (path: string): Promise<unknown> => FILES[path] ?? null

describe('paths', () => {
  it('maps ids to asset paths with the default namespace', () => {
    expect(modelPath('block/stone')).toBe('assets/minecraft/models/block/stone.json')
    expect(texturePath('mymod:block/ruby')).toBe('assets/mymod/textures/block/ruby.png')
    expect(blockstatePath('oak_log')).toBe('assets/minecraft/blockstates/oak_log.json')
  })
})

describe('resolveModel', () => {
  it('follows parents, merges textures and resolves #variables', async () => {
    const model = await resolveModel('minecraft:block/oak_log', load)
    expect(model.warnings).toEqual([])
    expect(model.elements).toHaveLength(1)
    const faces = model.elements[0]!.faces
    expect(faces.up?.texture).toEqual({ id: 'minecraft:block/oak_log_top', translucent: false })
    expect(faces.north?.texture).toEqual({ id: 'minecraft:block/oak_log', translucent: false })
    expect(faces.north?.tintIndex).toBe(-1)
  })

  it('reads the 26.1 sprite object form with force_translucent', async () => {
    const model = await resolveModel('block/glass', load)
    expect(model.elements[0]!.faces.east?.texture).toEqual({
      id: 'minecraft:block/glass',
      translucent: true
    })
  })

  it('reports missing models and parent loops instead of failing', async () => {
    expect((await resolveModel('block/nope', load)).warnings).toHaveLength(1)
    const loop = await resolveModel('block/loop_a', load)
    expect(loop.elements).toEqual([])
    expect(loop.warnings[0]).toContain('circolare')
  })

  it('reports undefined texture variables', async () => {
    const model = await resolveModel('block/cube', load)
    expect(model.elements[0]!.faces.up?.texture).toBeNull()
    expect(model.warnings).toHaveLength(6)
    expect(model.warnings).toContain('Variabile texture non definita: #up.')
  })
})

describe('resolveTextureVariable', () => {
  it('handles chains, missing refs and sprite objects pointing to variables', () => {
    const textures = { a: '#b', b: 'block/dirt', c: { sprite: '#b' }, loop: '#loop' }
    expect(resolveTextureVariable('#a', textures)?.id).toBe('minecraft:block/dirt')
    expect(resolveTextureVariable('#c', textures)?.id).toBe('minecraft:block/dirt')
    expect(resolveTextureVariable('#missing', textures)).toBeNull()
    expect(resolveTextureVariable('#loop', textures)).toBeNull()
  })
})

describe('blockstates', () => {
  const stairs = {
    variants: {
      'facing=east,half=bottom,shape=inner_left': {
        model: 'minecraft:block/oak_stairs_inner',
        uvlock: true,
        y: 270
      },
      'facing=east,half=bottom,shape=straight': { model: 'minecraft:block/oak_stairs' },
      'facing=east,half=top,shape=straight': {
        model: 'minecraft:block/oak_stairs',
        uvlock: true,
        x: 180
      },
      'facing=north,half=bottom,shape=straight': {
        model: 'minecraft:block/oak_stairs',
        uvlock: true,
        y: 270
      }
    }
  }

  it('lists variants and picks the unrotated plain one by default', () => {
    const variants = blockstateVariants(stairs)
    expect(variants).toHaveLength(4)
    expect(defaultVariant(variants)?.key).toBe('facing=east,half=bottom,shape=straight')
  })

  it('keeps every weighted choice (first one drawn by default) and the single "" variant', () => {
    const [variant] = blockstateVariants({
      variants: { '': [{ model: 'block/stone' }, { model: 'block/stone_mirrored', weight: 2 }] }
    })
    expect(variant).toEqual({
      key: '',
      models: [{ model: 'minecraft:block/stone', x: 0, y: 0, uvlock: false }],
      choices: [
        { model: { model: 'minecraft:block/stone', x: 0, y: 0, uvlock: false }, weight: 1 },
        { model: { model: 'minecraft:block/stone_mirrored', x: 0, y: 0, uvlock: false }, weight: 2 }
      ]
    })
  })

  it('uses unconditional multipart parts', () => {
    const [variant] = blockstateVariants({
      multipart: [
        { apply: { model: 'minecraft:block/oak_fence_post' } },
        {
          apply: { model: 'minecraft:block/oak_fence_side', uvlock: true },
          when: { north: 'true' }
        }
      ]
    })
    expect(variant?.models.map((m) => m.model)).toEqual(['minecraft:block/oak_fence_post'])
  })

  it('returns nothing for invalid files', () => {
    expect(blockstateVariants(null)).toEqual([])
    expect(defaultVariant([])).toBeNull()
  })
})

describe('geometry', () => {
  const full: [Vec3, Vec3] = [
    [0, 0, 0],
    [16, 16, 16]
  ]

  it('gives full faces the whole texture by default', () => {
    for (const d of ['down', 'up', 'north', 'south', 'west', 'east'] as const) {
      expect(defaultUv(d, ...full)).toEqual([0, 0, 16, 16])
    }
  })

  it('projects partial elements (bottom slab sides use the lower half)', () => {
    const [from, to]: [Vec3, Vec3] = [
      [0, 0, 0],
      [16, 8, 16]
    ]
    expect(defaultUv('north', from, to)).toEqual([0, 8, 16, 16])
    expect(defaultUv('up', from, to)).toEqual([0, 0, 16, 16])
  })

  it('orders corners so the first is top-left seen from outside', () => {
    // North face seen from the north: its top-left corner is at +X.
    expect(faceCorners('north', ...full)[0]).toEqual([16, 16, 0])
    expect(faceCorners('south', ...full)[0]).toEqual([0, 16, 16])
    expect(faceCorners('up', ...full)[0]).toEqual([0, 16, 0])
  })

  async function quadsOf(id: string, x = 0, y = 0) {
    return buildQuads(await resolveModel(id, load), { x, y })
  }

  it('builds 6 quads for a cube with outward normals', async () => {
    const quads = await quadsOf('block/oak_log')
    expect(quads).toHaveLength(6)
    for (const quad of quads) {
      const center = quad.positions.reduce((acc, p) => acc.map((v, i) => v + p[i]! / 4) as Vec3, [
        0, 0, 0
      ] as Vec3)
      const outward = center.map((v) => v - 8) as Vec3
      expect(
        outward[0] * quad.normal[0] + outward[1] * quad.normal[1] + outward[2] * quad.normal[2]
      ).toBeGreaterThan(0)
    }
  })

  it('y: 90 turns north into east, x: 90 turns north into down (as the observer uses it)', async () => {
    // Quads follow the face order down, up, north, south, west, east.
    const normals = (quads: Awaited<ReturnType<typeof quadsOf>>) => quads.map((q) => q.normal)
    const rotatedX = normals(await quadsOf('block/oak_log', 90, 0))
    expect(rotatedX[2]).toEqual([0, -1, 0]) // north → down (observer facing=down uses x: 90)
    expect(rotatedX[1]).toEqual([0, 0, -1]) // up → north
    const rotatedY = normals(await quadsOf('block/oak_log', 0, 90))
    expect(rotatedY[2]).toEqual([1, 0, 0]) // north → east
    // x: 90 + y: 90 is the vanilla axis=x log: its ends point east/west.
    const axisX = normals(await quadsOf('block/oak_log', 90, 90))
    expect([axisX[0], axisX[1]]).toEqual(
      expect.arrayContaining([
        [1, 0, 0],
        [-1, 0, 0]
      ])
    )
  })

  it('rotates face textures clockwise', () => {
    const model = {
      elements: [
        {
          from: [0, 0, 0] as Vec3,
          to: [16, 16, 16] as Vec3,
          rotation: null,
          faces: {
            up: {
              uv: [0, 0, 16, 16] as [number, number, number, number],
              texture: null,
              rotation: 90 as const,
              tintIndex: -1
            }
          }
        }
      ],
      ambientOcclusion: true,
      warnings: []
    }
    const [quad] = buildQuads(model, { x: 0, y: 0 })
    // The texture's top-left now sits at the top-right corner.
    expect(quad!.uvs[1]).toEqual([0, 0])
  })

  it('rotates elements around their origin and rescales', () => {
    const element = {
      from: [0, 0, 8] as Vec3,
      to: [16, 16, 8] as Vec3,
      rotation: {
        origin: [8, 8, 8] as Vec3,
        axes: [{ axis: 'y' as const, angle: 45 }],
        rescale: true
      },
      faces: { north: { uv: null, texture: null, rotation: 0 as const, tintIndex: -1 } }
    }
    const [quad] = buildQuads(
      { elements: [element], ambientOcclusion: true, warnings: [] },
      { x: 0, y: 0 }
    )
    // Rescaled by 1/cos(45°) and rotated: the plane spans the block diagonal.
    const [a, b] = [quad!.positions[0], quad!.positions[1]]
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeCloseTo(16 * Math.SQRT2, 6)
  })
})

describe('isBlockJsonPath', () => {
  it('accepts models and block states of any namespace, nothing else', () => {
    expect(isBlockJsonPath('assets/minecraft/models/block/wheat_stage7_v2.json')).toBe(true)
    expect(isBlockJsonPath('assets/mymod/blockstates/ruby.json')).toBe(true)
    expect(isBlockJsonPath('assets/minecraft/textures/block/stone.png')).toBe(false)
    expect(isBlockJsonPath('assets/minecraft/models/block/Stone.json')).toBe(false)
    expect(isBlockJsonPath('pack.mcmeta')).toBe(false)
  })
})
