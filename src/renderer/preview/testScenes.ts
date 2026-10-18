// Scenes of the Test screen: where the tested block goes, next to which other blocks.
// Coordinates are block positions (+X east, +Y up, +Z south); the ground is y = 0.

export type Vec3 = [number, number, number]

/** Placeholder for the block being tested. */
export const MINE = '@mine'

export interface Placement {
  /** Block state name (pack first, then vanilla), or MINE. */
  block: string
  at: Vec3
}

export type SceneKind =
  'block' | 'wall' | 'floor' | 'field' | 'mixed' | 'house' | 'cave' | 'path' | 'hand'

export interface SceneDef {
  kind: SceneKind
  label: string
  /** Where the tested block is used (Italian). */
  hint: string
  /** Point the camera looks at. */
  focus: Vec3
  /** Camera position relative to `focus` (its length is the default distance). */
  camera: Vec3
  /** Vertical field of view: 70 like the game for built scenes. */
  fov: number
  build: (neighbours: readonly string[]) => Placement[]
}

/** Blocks proposed next to the tested one in the mixed scene. */
export const DEFAULT_NEIGHBOURS = ['grass_block', 'dirt', 'oak_planks', 'cobblestone']

export const BLOCK_SCENES: readonly SceneDef[] = [
  {
    kind: 'block',
    label: 'Blocco',
    hint: 'Il blocco da solo.',
    focus: [0, 0, 0],
    camera: scaled([0.7, 0.55, 0.85], 3.2),
    fov: 40,
    build: () => [{ block: MINE, at: [0, 0, 0] }]
  },
  {
    kind: 'wall',
    label: 'Muro 3×3',
    hint: 'Ripetuto in un muro: controlla le giunture.',
    focus: [0, 0, 0],
    camera: scaled([0.7, 0.55, 0.85], 6),
    fov: 40,
    build: () => square(3, (a, b) => [a, b, 0]).map((at) => ({ block: MINE, at }))
  },
  {
    kind: 'floor',
    label: 'Pavimento 5×5',
    hint: 'Ripetuto in un pavimento.',
    focus: [0, 0, 0],
    camera: scaled([0.7, 0.55, 0.85], 8.5),
    fov: 40,
    build: () => square(5, (a, b) => [a, 0, b]).map((at) => ({ block: MINE, at }))
  },
  {
    kind: 'field',
    label: 'Distesa 33×33',
    hint: 'Una grande distesa: allontanati per vedere come appare da lontano.',
    focus: [0, 0, 0],
    camera: scaled([0, 0.45, 1], 24),
    fov: 70,
    build: () => square(33, (a, b) => [a, 0, b]).map((at) => ({ block: MINE, at }))
  },
  {
    kind: 'mixed',
    label: 'Con altri blocchi',
    hint: 'La croce centrale e metà del muro sono il tuo blocco; il resto sono i blocchi scelti.',
    focus: [0, 1, -1],
    camera: [7, 6, 9],
    fov: 70,
    build: mixedScene
  },
  {
    kind: 'house',
    label: 'Angolo di casa',
    hint: 'Il tuo blocco forma i muri; tronchi, vetro, assi ed erba intorno.',
    focus: [-1, 2, -1],
    camera: [7, 3.5, 9],
    fov: 70,
    build: houseScene
  },
  {
    kind: 'cave',
    label: 'Grotta',
    hint: 'Il tuo blocco forma pareti, soffitto e pavimento di una galleria, rischiarata in fondo da una torcia.',
    focus: [0, 2, -3],
    camera: [0.6, 0.4, 11],
    fov: 70,
    build: caveScene
  },
  {
    kind: 'path',
    label: 'Sentiero',
    hint: 'Il tuo blocco forma un sentiero nell’erba, con un albero.',
    focus: [0, 0, -1],
    camera: [5, 5, 9],
    fov: 70,
    build: pathScene
  }
]

/** The only scene for item textures: the item held in the right hand, over a lawn. */
export const HAND_SCENE: SceneDef = {
  kind: 'hand',
  label: 'In mano',
  hint: 'L’oggetto tenuto nella mano destra, in prima persona.',
  // The eye is 1.62 blocks above the ground's top face (y = 0.5).
  focus: [0, 1.6, -4],
  camera: [0, 0.52, 4],
  fov: 70,
  build: () => square(9, (a, b) => [a, 0, b - 3]).map((at) => ({ block: 'grass_block', at }))
}

export function sceneByKind(kind: SceneKind): SceneDef {
  return kind === 'hand'
    ? HAND_SCENE
    : (BLOCK_SCENES.find((s) => s.kind === kind) ?? BLOCK_SCENES[0]!)
}

/** Distinct block names used by a scene (MINE excluded). */
export function sceneBlocks(placements: readonly Placement[]): string[] {
  return [...new Set(placements.map((p) => p.block))].filter((b) => b !== MINE)
}

function mixedScene(neighbours: readonly string[]): Placement[] {
  const others = neighbours.length > 0 ? neighbours : [MINE]
  const placements: Placement[] = []
  // 9×9 ground: a cross of the tested block, one neighbour per quadrant.
  for (const [x, , z] of square(9, (a, b) => [a, 0, b])) {
    const quadrant = (x > 0 ? 1 : 0) + (z > 0 ? 2 : 0)
    const block = x === 0 || z === 0 ? MINE : others[quadrant % others.length]!
    placements.push({ block, at: [x, 0, z] })
  }
  // Back wall, 3 high: columns alternate the tested block and each neighbour.
  for (let x = -4; x <= 4; x++) {
    const block = x % 2 === 0 ? MINE : others[((x + 5) / 2) % others.length]!
    for (let y = 1; y <= 3; y++) placements.push({ block, at: [x, y, -4] })
  }
  return placements
}

function houseScene(): Placement[] {
  const blocks = new Map<string, Placement>()
  const put = (block: string, at: Vec3): void => {
    blocks.set(at.join(','), { block, at })
  }
  for (const [x, , z] of square(11, (a, b) => [a, 0, b])) {
    // Planks inside the corner, grass outside.
    put(x > -3 && z > -3 && x < 3 && z < 3 ? 'oak_planks' : 'grass_block', [x, 0, z])
  }
  for (let y = 1; y <= 4; y++) {
    put('oak_log', [-3, y, -3])
    for (let i = -2; i <= 3; i++) {
      put(MINE, [i, y, -3])
      put(MINE, [-3, y, i])
    }
  }
  // Windows and a door opening.
  for (const y of [2, 3]) {
    put('glass', [0, y, -3])
    put('glass', [-3, y, 0])
  }
  for (const y of [1, 2]) blocks.delete([2, y, -3].join(','))
  return [...blocks.values()]
}

function caveScene(): Placement[] {
  const placements: Placement[] = []
  for (let z = -8; z <= 6; z++) {
    for (let x = -3; x <= 3; x++) {
      for (let y = 0; y <= 4; y++) {
        const inside = x > -3 && x < 3 && y > 0 && y < 4
        if (inside) continue
        // A few vanilla blocks so the walls are not all the same.
        const ore = (x === -3 && y === 2 && z === -2) || (x === 3 && y === 1 && z === 2)
        const gravel = y === 0 && (x + z * 3) % 7 === 0
        placements.push({ block: ore ? 'coal_ore' : gravel ? 'gravel' : MINE, at: [x, y, z] })
      }
    }
  }
  // The tunnel ends against a wall, with a torch: sky light fades inside, block light near it.
  for (let x = -2; x <= 2; x++) {
    for (let y = 1; y <= 3; y++) placements.push({ block: MINE, at: [x, y, -9] })
  }
  placements.push({ block: 'torch', at: [0, 1, -7] })
  return placements
}

function pathScene(): Placement[] {
  const placements: Placement[] = []
  for (const [x, , z] of square(13, (a, b) => [a, 0, b])) {
    const center = Math.round(2 * Math.sin(z / 2.5))
    const onPath = x >= center - 1 && x <= center
    placements.push({ block: onPath ? MINE : 'grass_block', at: [x, 0, z] })
  }
  // A small tree beside the path.
  for (let y = 1; y <= 4; y++) placements.push({ block: 'oak_log', at: [4, y, -3] })
  for (let x = 3; x <= 5; x++) {
    for (let z = -4; z <= -2; z++) {
      for (let y = 4; y <= 5; y++) {
        if (x === 4 && z === -3 && y === 4) continue
        placements.push({ block: 'oak_leaves', at: [x, y, z] })
      }
    }
  }
  placements.push({ block: 'oak_leaves', at: [4, 6, -3] })
  return placements
}

/** size × size cells centered on 0, mapped to 3D by `place`. */
function square(size: number, place: (a: number, b: number) => Vec3): Vec3[] {
  const half = (size - 1) / 2
  const cells: Vec3[] = []
  for (let a = -half; a <= half; a++) for (let b = -half; b <= half; b++) cells.push(place(a, b))
  return cells
}

function scaled(direction: Vec3, length: number): Vec3 {
  const norm = Math.hypot(...direction)
  return direction.map((c) => (c / norm) * length) as Vec3
}
