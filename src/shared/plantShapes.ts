// Shapes for plant models (crops, flowers): block model JSON written into the pack, so they work
// in the vanilla game without mods. Research 2026-10-19: Vanilla+ Crops uses a "bushy cross" of
// 4–6 planes tilted at ±22.5° and ±45° and a taller ripe wheat; vanilla crops are 4 planes
// (`block/crop`), flowers 2 diagonal planes (`block/cross`). Element rotations stay single-axis
// at −45…45° in 22.5° steps, which every version accepts.

export type PlantShape = 'crop' | 'cross' | 'bushy' | 'tall'

export const PLANT_SHAPES: ReadonlyArray<{ id: PlantShape; label: string; hint: string }> = [
  { id: 'crop', label: 'Vanilla', hint: 'I 4 piani a cancelletto delle colture del gioco.' },
  { id: 'cross', label: 'Croce', hint: '2 piani in diagonale, come i fiori e l’erba.' },
  {
    id: 'bushy',
    label: 'Cespuglio',
    hint: '4 piani inclinati verso l’esterno (22,5°) più 2 diagonali: una pianta più piena.'
  },
  {
    id: 'tall',
    label: 'Alta',
    hint: 'Sale di un blocco: una seconda texture (<nome>_top) disegna la parte di sopra.'
  }
]

type Vec3 = [number, number, number]

interface Element {
  from: Vec3
  to: Vec3
  rotation?: { origin: Vec3; axis: 'x' | 'y' | 'z'; angle: number; rescale?: boolean }
  shade_direction_override?: 'up'
  faces: Record<string, { uv: [number, number, number, number]; texture: string }>
}

/** A crop plane at `at` (4 or 12) facing along x (`x`) or z, from y to y + 16, both sides. */
function plane(facing: 'x' | 'z', at: number, y: number, texture: string, tilt = 0): Element {
  const forward: [number, number, number, number] = [0, 0, 16, 16]
  const mirrored: [number, number, number, number] = [16, 0, 0, 16]
  // As vanilla's crop model: the outer side of each plane shows the texture unmirrored.
  const outerFirst = at < 8
  const [a, b] = outerFirst ? [forward, mirrored] : [mirrored, forward]
  const element: Element =
    facing === 'x'
      ? {
          from: [at, y, 0],
          to: [at, y + 16, 16],
          faces: { west: { uv: a, texture }, east: { uv: b, texture } }
        }
      : {
          from: [0, y, at],
          to: [16, y + 16, at],
          faces: { north: { uv: a, texture }, south: { uv: b, texture } }
        }
  element.shade_direction_override = 'up'
  if (tilt !== 0) {
    // Lean the top outwards around the plane's base (right-hand angles, like the model format).
    const outwards = at < 8 ? 1 : -1
    element.rotation =
      facing === 'x'
        ? { origin: [at, y, 8], axis: 'z', angle: tilt * outwards }
        : { origin: [8, y, at], axis: 'x', angle: -tilt * outwards }
  }
  return element
}

/** A diagonal plane (as `block/cross`), from y to y + 16. */
function diagonal(direction: 1 | -1, y: number, texture: string): Element {
  return {
    from: [0.8, y, 8],
    to: [15.2, y + 16, 8],
    rotation: { origin: [8, 8, 8], axis: 'y', angle: 45 * direction, rescale: true },
    shade_direction_override: 'up',
    faces: {
      north: { uv: [0, 0, 16, 16], texture },
      south: { uv: [16, 0, 0, 16], texture }
    }
  }
}

function crop(y: number, texture: string, tilt = 0): Element[] {
  return [
    plane('x', 4, y, texture, tilt),
    plane('x', 12, y, texture, tilt),
    plane('z', 4, y, texture, tilt),
    plane('z', 12, y, texture, tilt)
  ]
}

/**
 * Model JSON of a plant shape drawing `texture` (a texture id such as `minecraft:block/wheat_stage7`);
 * the tall shape draws its upper block with `topTexture`. Like vanilla crops: no ambient
 * occlusion, the planes sunk one pixel into the farmland.
 */
export function plantShapeModel(
  shape: PlantShape,
  texture: string,
  topTexture: string | null = null
): Record<string, unknown> {
  if (shape === 'crop') return { parent: 'minecraft:block/crop', textures: { crop: texture } }
  if (shape === 'cross') {
    // The texture stays in `crop`, the variable random variants override, whatever the shape.
    return { parent: 'minecraft:block/cross', textures: { crop: texture, cross: '#crop' } }
  }
  const textures: Record<string, string> = { particle: '#crop', crop: texture }
  let elements: Element[]
  if (shape === 'bushy') {
    elements = [...crop(-1, '#crop', 22.5), diagonal(1, -1, '#crop'), diagonal(-1, -1, '#crop')]
  } else {
    textures['top'] = topTexture ?? texture
    elements = [...crop(-1, '#crop'), ...crop(15, '#top')]
  }
  return { ambientocclusion: false, textures, elements }
}

/** `minecraft:block/wheat_stage7` → `minecraft:block/wheat_stage7_top`. */
export function topTextureId(texture: string): string {
  return `${texture}_top`
}
