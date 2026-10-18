// Game-like light for the preview scenes: sky light and block light levels (0–15) flooded over the
// scene's block grid, then smooth lighting + ambient occlusion per face corner. Pure, unit-tested.
// Sources (verified 2026-10-18):
// - https://minecraft.wiki/w/Light: sky light 15 goes straight down through transparent blocks
//   without loss, otherwise both lights drop by 1 per block (taxicab); leaves, ice, slime… filter
//   1 more sky light; glass has no effect; light-emitting blocks and their levels.
// - Sodium's AoFaceData (CaffeineMC/sodium, vanilla smooth lighting reimplemented): per corner, the
//   two edge neighbours, the diagonal (replaced by an edge when both edges are opaque) and the
//   cell in front of the face; AO = mean of shade brightness (0.2 for full-cube shapes, else 1);
//   light = mean with zero values raised to the smallest non-zero one.
// - The 26.3 client's shaders/core/lightmap.fsh: brightness = level / (4 − 3·level) (level 0–1),
//   sky and block light added together.

export type Vec3 = [number, number, number]

/** How a block interacts with light. */
export interface LightProps {
  /** Stops light (opaque full block, e.g. stone; not glass or leaves). */
  opaque: boolean
  /** Full-cube shape: darkens corners next to it (glass and leaves too). */
  fullShape: boolean
  /** Lets light through but takes 1 more sky light (leaves, ice, slime…). */
  filtersSky: boolean
  /** Light level it emits (0–15). */
  emission: number
}

export interface LitBlock {
  at: Vec3
  light: LightProps
}

/** Light-emitting blocks in their default state, from minecraft.wiki/w/Light (Java). */
export const LIGHT_EMISSION: Readonly<Record<string, number>> = {
  beacon: 15,
  conduit: 15,
  end_gateway: 15,
  end_portal: 15,
  fire: 15,
  glowstone: 15,
  jack_o_lantern: 15,
  lantern: 15,
  lava: 15,
  lava_cauldron: 15,
  campfire: 15,
  sea_lantern: 15,
  shroomlight: 15,
  ochre_froglight: 15,
  verdant_froglight: 15,
  pearlescent_froglight: 15,
  torch: 14,
  wall_torch: 14,
  copper_torch: 14,
  copper_wall_torch: 14,
  end_rod: 14,
  crying_obsidian: 10,
  soul_campfire: 10,
  soul_fire: 10,
  soul_lantern: 10,
  soul_torch: 10,
  soul_wall_torch: 10,
  enchanting_table: 7,
  ender_chest: 7,
  glow_lichen: 7,
  redstone_torch: 7,
  redstone_wall_torch: 7,
  amethyst_cluster: 5,
  large_amethyst_bud: 4,
  magma_block: 3,
  medium_amethyst_bud: 2,
  brewing_stand: 1,
  brown_mushroom: 1,
  dragon_egg: 1,
  end_portal_frame: 1,
  sculk_sensor: 1,
  calibrated_sculk_sensor: 1,
  small_amethyst_bud: 1
}

const SKY_FILTERS = /(^|_)(leaves|ice)$|^(slime_block|honey_block|cobweb|spawner|beacon)$/
/** Full cubes that let light through (rendered cutout or translucent). */
const SEE_THROUGH = /(^|_)(glass|leaves|ice)$|^(slime_block|honey_block|barrier|spawner|beacon)$/

/** Light properties of a block from its name and whether its model is one full cube. */
export function lightPropsFor(block: string, fullCube: boolean): LightProps {
  const name = block.includes(':') ? block.slice(block.indexOf(':') + 1) : block
  return {
    opaque: fullCube && !SEE_THROUGH.test(name),
    fullShape: fullCube,
    filtersSky: SKY_FILTERS.test(name),
    emission: LIGHT_EMISSION[name] ?? 0
  }
}

/** Rendered brightness of a light level 0–15, as the game's lightmap (0–1). */
export function brightness(level: number): number {
  const l = Math.max(0, Math.min(15, level)) / 15
  return l / (4 - 3 * l)
}

/** Sky and block light of every cell around the scene; outside it is open sky. */
export class LightGrid {
  private readonly min: Vec3
  private readonly size: Vec3
  private readonly props: Array<LightProps | undefined>
  readonly sky: Uint8Array
  readonly block: Uint8Array

  constructor(blocks: readonly LitBlock[]) {
    const lo: Vec3 = [Infinity, Infinity, Infinity]
    const hi: Vec3 = [-Infinity, -Infinity, -Infinity]
    for (const { at } of blocks) {
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i]!, at[i]!)
        hi[i] = Math.max(hi[i]!, at[i]!)
      }
    }
    if (blocks.length === 0) {
      lo.fill(0)
      hi.fill(0)
    }
    // One free cell around everything (light flows in from the sides and the sky above).
    this.min = [lo[0] - 1, lo[1] - 1, lo[2] - 1]
    this.size = [hi[0] - lo[0] + 3, hi[1] - lo[1] + 3, hi[2] - lo[2] + 3]
    const count = this.size[0] * this.size[1] * this.size[2]
    this.props = new Array<LightProps | undefined>(count)
    this.sky = new Uint8Array(count)
    this.block = new Uint8Array(count)
    for (const { at, light } of blocks) this.props[this.index(at[0], at[1], at[2])] = light
    this.floodSky()
    this.floodBlocks()
  }

  /** Light properties at a cell (undefined = air). */
  propsAt(x: number, y: number, z: number): LightProps | undefined {
    return this.inside(x, y, z) ? this.props[this.index(x, y, z)] : undefined
  }

  skyAt(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.sky[this.index(x, y, z)]! : 15
  }

  blockAt(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.block[this.index(x, y, z)]! : 0
  }

  private inside(x: number, y: number, z: number): boolean {
    const dx = x - this.min[0]
    const dy = y - this.min[1]
    const dz = z - this.min[2]
    return (
      dx >= 0 && dy >= 0 && dz >= 0 && dx < this.size[0] && dy < this.size[1] && dz < this.size[2]
    )
  }

  private index(x: number, y: number, z: number): number {
    const [sx, sy] = this.size
    return x - this.min[0] + sx * (y - this.min[1] + sy * (z - this.min[2]))
  }

  private floodSky(): void {
    const [sx, sy, sz] = this.size
    const queue: number[][] = Array.from({ length: 16 }, () => [])
    // Straight down from the open sky, full strength until something stops or filters it.
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) {
        let level = 15
        for (let y = sy - 1; y >= 0 && level > 0; y--) {
          const i = x + sx * (y + sy * z)
          const props = this.props[i]
          if (props?.opaque) break
          if (props?.filtersSky) level--
          this.sky[i] = level
          queue[level]!.push(i)
        }
      }
    }
    this.flood(this.sky, queue, true)
  }

  private floodBlocks(): void {
    const queue: number[][] = Array.from({ length: 16 }, () => [])
    this.props.forEach((props, i) => {
      if (props && props.emission > 0) {
        this.block[i] = props.emission
        queue[props.emission]!.push(i)
      }
    })
    this.flood(this.block, queue, false)
  }

  /** Spreads levels to the 6 neighbours, losing 1 per step, brightest first. */
  private flood(levels: Uint8Array, queue: number[][], sky: boolean): void {
    const [sx, sy, sz] = this.size
    for (let level = 15; level > 1; level--) {
      for (const i of queue[level]!) {
        if (levels[i]! !== level) continue
        const x = i % sx
        const y = Math.floor(i / sx) % sy
        const z = Math.floor(i / (sx * sy))
        for (const [dx, dy, dz] of NEIGHBOURS) {
          const nx = x + dx
          const ny = y + dy
          const nz = z + dz
          if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) continue
          const n = nx + sx * (ny + sy * nz)
          const props = this.props[n]
          if (props?.opaque) continue
          const next = level - 1 - (sky && props?.filtersSky ? 1 : 0)
          if (next > levels[n]!) {
            levels[n] = next
            queue[next]!.push(n)
          }
        }
      }
    }
  }
}

const NEIGHBOURS: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1]
]

export interface CornerLight {
  /** Smoothed levels 0–15 (fractional). */
  sky: number
  block: number
  /** Ambient occlusion factor 0.2–1. */
  ao: number
}

const FULL_LIGHT: CornerLight = { sky: 15, block: 0, ao: 1 }

/**
 * Light at a corner of a face, like the game's smooth lighting.
 * `at` is the block, `normal` the face direction (axis-aligned faces only, others get the light of
 * the block's own cell without AO), `corner` the vertex in the block's 0–16 pixel space, and
 * `onBoundary` whether the face lies on the block's side (then the cell in front is used).
 */
export function cornerLight(
  grid: LightGrid,
  at: Vec3,
  normal: Vec3,
  corner: Vec3,
  onBoundary: boolean
): CornerLight {
  const axis = normal.findIndex((c) => Math.abs(c) > 0.999)
  if (axis < 0) {
    return { sky: grid.skyAt(...at), block: grid.blockAt(...at), ao: 1 }
  }
  const step = Math.sign(normal[axis]!)
  let front: Vec3 = at
  if (onBoundary) {
    front = [...at] as Vec3
    front[axis] = at[axis]! + step
  }
  // A face pressed against an opaque block takes the light of its own block (like the game).
  const lightCell = onBoundary && grid.propsAt(...front)?.opaque ? at : front
  const [t1, t2] = [0, 1, 2].filter((i) => i !== axis) as [number, number]
  const offset = (cell: Vec3, i: number, s: number): Vec3 => {
    const out = [...cell] as Vec3
    out[i] = cell[i]! + s
    return out
  }
  const s1 = corner[t1]! >= 8 ? 1 : -1
  const s2 = corner[t2]! >= 8 ? 1 : -1
  const e1 = offset(front, t1, s1)
  const e2 = offset(front, t2, s2)
  const e1opaque = grid.propsAt(...e1)?.opaque ?? false
  const e2opaque = grid.propsAt(...e2)?.opaque ?? false
  const diagonal = e1opaque && e2opaque ? e1 : offset(e1, t2, s2)
  const shade = (cell: Vec3): number => (grid.propsAt(...cell)?.fullShape ? 0.2 : 1)
  const cells = [e1, e2, diagonal]
  const ao = (shade(e1) + shade(e2) + shade(diagonal) + shade(front)) / 4
  const level = (read: (x: number, y: number, z: number) => number): number =>
    smoothLevel([...cells.map((c) => read(...c)), read(...lightCell)])
  return {
    sky: level((x, y, z) => grid.skyAt(x, y, z)),
    block: level((x, y, z) => grid.blockAt(x, y, z)),
    ao
  }
}

/** Mean of four levels, zeros (opaque or unlit cells) raised to the smallest non-zero one. */
function smoothLevel(levels: number[]): number {
  const lit = levels.filter((l) => l > 0)
  if (lit.length === 0) return 0
  const min = Math.min(...lit)
  return levels.reduce((sum, l) => sum + Math.max(l, min), 0) / levels.length
}

/** Light of a corner when the scene has no light data (e.g. a single model): full daylight. */
export function fullLight(): CornerLight {
  return { ...FULL_LIGHT }
}
