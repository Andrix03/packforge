// Connected textures (CTM) in the OptiFine format, also read by Continuity (Fabric): pure logic.
//
// Sources (read 2026-10-19): OptiFine doc/ctm.properties (methods, tile counts, keys); Continuity
// 1.20.1/dev CtmSpriteProvider (the 256-entry SPRITE_INDEX_MAP) and CtmPropertiesLoader (scans
// `assets/<namespace>/optifine/ctm/**.properties` of every pack; `method` defaults to ctm).
//
// Neighbour bits, as seen on the face (texture space: up = towards the texture's top row):
//   128  64  32
//     1   *  16
//     2   4   8
// A corner bit only counts when both of its edge neighbours connect.

export const LEFT = 1
export const DOWN_LEFT = 2
export const DOWN = 4
export const DOWN_RIGHT = 8
export const RIGHT = 16
export const UP_RIGHT = 32
export const UP = 64
export const UP_LEFT = 128

/** Tile (0–46) of the `ctm` method for each 8-bit neighbour mask (Continuity's table). */
export const CTM_INDEX: readonly number[] = [
  0, 3, 0, 3, 12, 5, 12, 15, 0, 3, 0, 3, 12, 5, 12, 15, 1, 2, 1, 2, 4, 7, 4, 29, 1, 2, 1, 2, 13, 31,
  13, 14, 0, 3, 0, 3, 12, 5, 12, 15, 0, 3, 0, 3, 12, 5, 12, 15, 1, 2, 1, 2, 4, 7, 4, 29, 1, 2, 1, 2,
  13, 31, 13, 14, 36, 17, 36, 17, 24, 19, 24, 43, 36, 17, 36, 17, 24, 19, 24, 43, 16, 18, 16, 18, 6,
  46, 6, 21, 16, 18, 16, 18, 28, 9, 28, 22, 36, 17, 36, 17, 24, 19, 24, 43, 36, 17, 36, 17, 24, 19,
  24, 43, 37, 40, 37, 40, 30, 8, 30, 34, 37, 40, 37, 40, 25, 23, 25, 45, 0, 3, 0, 3, 12, 5, 12, 15,
  0, 3, 0, 3, 12, 5, 12, 15, 1, 2, 1, 2, 4, 7, 4, 29, 1, 2, 1, 2, 13, 31, 13, 14, 0, 3, 0, 3, 12, 5,
  12, 15, 0, 3, 0, 3, 12, 5, 12, 15, 1, 2, 1, 2, 4, 7, 4, 29, 1, 2, 1, 2, 13, 31, 13, 14, 36, 39,
  36, 39, 24, 41, 24, 27, 36, 39, 36, 39, 24, 41, 24, 27, 16, 42, 16, 42, 6, 20, 6, 10, 16, 42, 16,
  42, 28, 35, 28, 44, 36, 39, 36, 39, 24, 41, 24, 27, 36, 39, 36, 39, 24, 41, 24, 27, 37, 38, 37,
  38, 30, 11, 30, 32, 37, 38, 37, 38, 25, 33, 25, 26
]

export const CTM_TILES = 47

/** Drops corner bits whose two edges do not both connect (they never count). */
export function normalizeMask(mask: number): number {
  let out = mask & (LEFT | DOWN | RIGHT | UP)
  const corner = (bit: number, a: number, b: number): void => {
    if (mask & bit && out & a && out & b) out |= bit
  }
  corner(DOWN_LEFT, DOWN, LEFT)
  corner(DOWN_RIGHT, DOWN, RIGHT)
  corner(UP_RIGHT, UP, RIGHT)
  corner(UP_LEFT, UP, LEFT)
  return out
}

export function ctmTile(mask: number): number {
  return CTM_INDEX[normalizeMask(mask) & 255]!
}

/** The neighbour mask each of the 47 tiles stands for (its normalized connections). */
export const CTM_TILE_MASKS: readonly number[] = (() => {
  const masks: number[] = new Array<number>(CTM_TILES).fill(-1)
  for (let mask = 0; mask < 256; mask++) {
    const normal = normalizeMask(mask)
    if (normal !== mask) continue
    const tile = CTM_INDEX[mask]!
    if (masks[tile] === -1) masks[tile] = mask
  }
  return masks
})()

/** `horizontal` method (4 tiles): 0 = joins on the right, 1 = both, 2 = left, 3 = alone. */
export function horizontalTile(mask: number): number {
  const left = (mask & LEFT) !== 0
  const right = (mask & RIGHT) !== 0
  return left && right ? 1 : right ? 0 : left ? 2 : 3
}

/** `vertical` method (4 tiles): 0 = joins above, 1 = both, 2 = below, 3 = alone. */
export function verticalTile(mask: number): number {
  const up = (mask & UP) !== 0
  const down = (mask & DOWN) !== 0
  return up && down ? 1 : down ? 2 : up ? 0 : 3
}

export type CtmMethod =
  | 'ctm'
  | 'ctm_compact'
  | 'horizontal'
  | 'vertical'
  | 'horizontal+vertical'
  | 'vertical+horizontal'
  | 'top'
  | 'random'
  | 'repeat'
  | 'fixed'
  | 'overlay'
  | 'overlay_ctm'
  | 'overlay_random'
  | 'overlay_repeat'
  | 'overlay_fixed'

/** A parsed `.properties` file: keys as written (values trimmed). */
export type Properties = ReadonlyMap<string, string>

/** Java-style .properties: `key=value` or `key:value`, `#`/`!` comments, `\` line joins. */
export function parseProperties(text: string): Map<string, string> {
  const out = new Map<string, string>()
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!.trim()
    while (line.endsWith('\\') && i + 1 < lines.length)
      line = line.slice(0, -1) + lines[++i]!.trim()
    if (line === '' || line.startsWith('#') || line.startsWith('!')) continue
    const match = /^([^=:\s]+)\s*[=:\s]\s*(.*)$/.exec(line)
    if (match) out.set(match[1]!, match[2]!.trim())
  }
  return out
}

export function serializeProperties(
  entries: ReadonlyArray<readonly [string, string]>,
  comment?: string
): string {
  const head = comment ? `# ${comment}\n` : ''
  return head + entries.map(([key, value]) => `${key}=${value}`).join('\n') + '\n'
}

/** Expands `tiles=` (numbers, ranges `0-46`, names): `0` → `0.png`. Keeps `<skip>`/`<default>`. */
export function expandTiles(value: string): string[] {
  const out: string[] = []
  for (const part of value.split(/\s+/).filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(part)
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n++) out.push(`${n}.png`)
    } else if (/^\d+$/.test(part)) {
      out.push(`${part}.png`)
    } else if (part.startsWith('<')) {
      out.push(part)
    } else {
      out.push(part.endsWith('.png') ? part : `${part}.png`)
    }
  }
  return out
}

/** Tiles each method expects (null = any number). */
export function tilesFor(method: CtmMethod, properties: Properties): number | null {
  switch (method) {
    case 'ctm':
    case 'overlay_ctm':
      return CTM_TILES
    case 'ctm_compact':
      return 5
    case 'horizontal':
    case 'vertical':
    case 'horizontal+vertical':
    case 'vertical+horizontal':
      return 4
    case 'top':
    case 'fixed':
    case 'overlay_fixed':
      return 1
    case 'overlay':
      return 17
    case 'repeat':
    case 'overlay_repeat': {
      const w = Number(properties.get('width'))
      const h = Number(properties.get('height'))
      return w > 0 && h > 0 ? w * h : null
    }
    default:
      return null
  }
}

/** Where the game looks for CTM files: `assets/<ns>/optifine/ctm/` (any depth). */
export function isCtmProperties(path: string): boolean {
  return /^assets\/[^/]+\/optifine\/ctm\/.+\.properties$/.test(path)
}
