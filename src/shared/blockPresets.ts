// Ready-made 3D block shapes (Phase 13 presets), vanilla model JSON only, after the most
// downloaded model packs on Modrinth: bushy leaves (Better Leaves style: crossed planes sticking out
// of the leaf cube), grass all over the block's sides (Fast Better Grass style) and a ladder made
// of its pixels (shared/extrude.ts). Vanilla models they replace, checked on 26.3: block/leaves
// (tint 0 on every face), block/grass_block, block/ladder (a plane at z 15.2 seen from north). Pure.
import { namespaced } from './blockModel'
import { extrudeModel } from './extrude'
import { tr } from './i18n'

export type BlockPresetId = 'bushy_leaves' | 'grass_sides' | 'ladder_3d' | 'rails_3d'

export interface BlockPreset {
  id: BlockPresetId
  label: string
  hint: string
  /** The block model written (`minecraft:block/oak_leaves`). */
  model: string
}

/** The presets that fit a block texture. */
export function presetsFor(texturePath: string): BlockPreset[] {
  const m = /^assets\/([^/]+)\/textures\/block\/([a-z0-9_]+)\.png$/.exec(texturePath)
  if (!m) return []
  const [, ns, name] = m as unknown as [string, string, string]
  const out: BlockPreset[] = []
  if (name.endsWith('_leaves')) {
    out.push({
      id: 'bushy_leaves',
      label: tr('Foglie folte'),
      hint: tr('Ciuffi di foglie che escono dal blocco su ogni lato.'),
      model: `${ns}:block/${name}`
    })
  }
  if (ns === 'minecraft' && /^grass_block_(top|side|side_overlay)$/.test(name)) {
    out.push({
      id: 'grass_sides',
      label: tr('Erba sui lati'),
      hint: tr('I lati del blocco d’erba diventano verdi come la cima (terra solo sotto).'),
      model: 'minecraft:block/grass_block'
    })
  }
  if (
    ns === 'minecraft' &&
    /^(rail|rail_corner|(powered|detector|activator)_rail(_on)?)$/.test(name)
  ) {
    out.push({
      id: 'rails_3d',
      label: tr('Binari in 3D'),
      hint: tr(
        'Rotaie e traversine in rilievo, anche sui binari in salita, fatti dai pixel della texture.'
      ),
      model: `minecraft:block/${name}`
    })
  }
  if (name === 'ladder') {
    out.push({
      id: 'ladder_3d',
      label: tr('Scala in 3D'),
      hint: tr('Pioli e montanti in rilievo, fatti dai pixel della texture.'),
      model: `${ns}:block/ladder`
    })
  }
  return out
}

const CUBE_FACES = ['down', 'up', 'north', 'south', 'west', 'east'] as const

/**
 * Leaves with crossed planes reaching `spread` pixels out of the cube: two diagonal (45°, allowed
 * in every version) and two straight through the middle; every face tinted like the leaves.
 */
export function bushyLeavesModel(texture: string, spread = 3): Record<string, unknown> {
  const face = { uv: [0, 0, 16, 16], texture: '#all', tintindex: 0 }
  const lo = -spread
  const hi = 16 + spread
  const plane = (
    from: number[],
    to: number[],
    faces: string[],
    angle: number | null
  ): Record<string, unknown> => ({
    from,
    to,
    ...(angle === null ? {} : { rotation: { origin: [8, 8, 8], axis: 'y', angle } }),
    faces: Object.fromEntries(faces.map((f) => [f, face]))
  })
  return {
    parent: 'minecraft:block/block',
    textures: { all: texture, particle: texture },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: Object.fromEntries(CUBE_FACES.map((f) => [f, { ...face, cullface: f }]))
      },
      plane([lo, lo, 8], [hi, hi, 8], ['north', 'south'], 45),
      plane([lo, lo, 8], [hi, hi, 8], ['north', 'south'], -45),
      plane([lo, lo, 8], [hi, hi, 8], ['north', 'south'], null),
      plane([8, lo, lo], [8, hi, hi], ['west', 'east'], null)
    ]
  }
}

/** The grass block with the top texture (tinted) on its four sides too; dirt underneath. */
export function grassSidesModel(): Record<string, unknown> {
  const top = { uv: [0, 0, 16, 16], texture: '#top', tintindex: 0 }
  return {
    parent: 'minecraft:block/block',
    textures: {
      particle: 'minecraft:block/dirt',
      bottom: 'minecraft:block/dirt',
      top: 'minecraft:block/grass_block_top'
    },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 16, 16],
        faces: Object.fromEntries(
          CUBE_FACES.map((f) => [
            f,
            f === 'down'
              ? { uv: [0, 0, 16, 16], texture: '#bottom', cullface: f }
              : { ...top, cullface: f }
          ])
        )
      }
    ]
  }
}

export type LadderResult =
  | { ok: true; model: Record<string, unknown>; elements: number; faces: number }
  | { ok: false; error: string }

/**
 * The ladder extruded one pixel deep against the wall it hangs on (the south side of the model,
 * like vanilla's plane at z 15.2), reading the right way round from the north as vanilla does.
 */
export function ladder3dModel(
  width: number,
  height: number,
  opaque: (x: number, y: number) => boolean,
  texture: string
): LadderResult {
  const extruded = extrudeModel(width, height, opaque, namespaced(texture), {
    thickness: 1,
    budget: 120
  })
  if (!extruded.ok) return extruded
  const swap: Record<string, string> = { east: 'west', west: 'east' }
  type Element = { from: number[]; to: number[]; faces: Record<string, unknown> }
  const elements = (extruded.model['elements'] as Element[]).map((e) => ({
    // Mirrored in x (the extrusion reads right from the south) and moved against the wall.
    from: [16 - e.to[0]!, e.from[1]!, e.from[2]! + 7.5],
    to: [16 - e.from[0]!, e.to[1]!, e.to[2]! + 7.5],
    faces: Object.fromEntries(Object.entries(e.faces).map(([f, v]) => [swap[f] ?? f, v]))
  }))
  return {
    ok: true,
    model: {
      ambientocclusion: false,
      textures: { particle: namespaced(texture), texture: namespaced(texture) },
      elements
    },
    elements: elements.length,
    faces: extruded.faces
  }
}

export type RailSlope = 'flat' | 'ne' | 'sw'

/**
 * A rail made of its pixels, one pixel thick, lying where vanilla's plane is (y 1) or, for the
 * sloped ones, on the same 45° slope (every piece turned about vanilla's pivot, rescaled the
 * same way). Read from above like vanilla: the texture's top row to the north.
 */
export function rail3dModel(
  width: number,
  height: number,
  opaque: (x: number, y: number) => boolean,
  texture: string,
  slope: RailSlope
): LadderResult {
  const extruded = extrudeModel(width, height, opaque, namespaced(texture), {
    thickness: 1,
    budget: 120
  })
  if (!extruded.ok) return extruded
  const base = slope === 'flat' ? 1 : 9
  type Face = { uv: number[]; texture: string; rotation?: number }
  type Element = { from: number[]; to: number[]; faces: Record<string, Face> }
  const elements = (extruded.model['elements'] as Element[]).map((e) => {
    const faces: Record<string, Face> = {}
    for (const [name, face] of Object.entries(e.faces)) {
      const [u1, v1, u2, v2] = face.uv as [number, number, number, number]
      // The sprite's front (south) looks up, its back down; its top edge faces north.
      if (name === 'south') faces['up'] = { ...face, texture: '#rail' }
      else if (name === 'north')
        faces['down'] = { uv: [u1 < u2 ? u1 : u2, v2, u1 < u2 ? u2 : u1, v1], texture: '#rail' }
      else if (name === 'up') faces['north'] = { uv: [u2, v1, u1, v2], texture: '#rail' }
      else if (name === 'down') faces['south'] = { ...face, texture: '#rail' }
      // The side strips run along z now: turned to lie along the face.
      else faces[name] = { ...face, texture: '#rail', rotation: 90 }
    }
    return {
      from: [e.from[0]!, e.from[2]! - 7.5 + base, 16 - e.to[1]!],
      to: [e.to[0]!, e.to[2]! - 7.5 + base, 16 - e.from[1]!],
      ...(slope === 'flat'
        ? {}
        : {
            rotation: {
              origin: [8, 9, 8],
              axis: 'x',
              angle: slope === 'ne' ? 45 : -45,
              rescale: true
            }
          }),
      faces
    }
  })
  return {
    ok: true,
    model: {
      ambientocclusion: false,
      textures: { particle: '#rail', rail: namespaced(texture) },
      elements
    },
    elements: elements.length,
    faces: extruded.faces
  }
}

/** The vanilla rail models drawn by a rail texture, with their slope. */
export function railModelsFor(name: string): Array<{ model: string; slope: RailSlope }> {
  const flat = [{ model: `minecraft:block/${name}`, slope: 'flat' as const }]
  if (name === 'rail_corner') return flat
  return [
    ...flat,
    { model: `minecraft:block/${name}_raised_ne`, slope: 'ne' as const },
    { model: `minecraft:block/${name}_raised_sw`, slope: 'sw' as const }
  ]
}
