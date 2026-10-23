// Small pixel glyphs that stand in for symbols the pixel fonts lack (✓ ✗ ⚠ ▶ ⏸ → ↔ …) and for the
// emoji the interface used to show: those fell back to the system's colour emoji font. Same
// 16×16 two-tone format as icons.ts, so they render through PixelIcon.
import type { PixelIconData } from './icons'
import { PixelGrid, art } from './pixelArt'

/** Two-tone glyph drawn with code: `a` full colour, `b` shade. */
function draw(paint: (a: PixelGrid, b: PixelGrid) => void): PixelIconData {
  const a = new PixelGrid()
  const b = new PixelGrid()
  paint(a, b)
  return { a: a.path(), b: b.path() }
}

/** The same rows mirrored left ↔ right. */
const flipX = (rows: readonly string[]): string[] => rows.map((row) => [...row].reverse().join(''))
/** Rows transposed (x ↔ y): a shape pointing right then points down. */
const transpose = (rows: readonly string[]): string[] =>
  rows.map((_, y) => rows.map((row) => row[y] ?? '.').join(''))

const PAD = '................'
const rows = (top: number, body: readonly string[]): string[] => {
  const out = [...Array<string>(top).fill(PAD), ...body]
  while (out.length < 16) out.push(PAD)
  return out
}

const PLAY = rows(2, [
  '.....#..........',
  '.....##.........',
  '.....###........',
  '.....####.......',
  '.....#####......',
  '.....######.....',
  '.....######.....',
  '.....#####......',
  '.....####.......',
  '.....###........',
  '.....##.........',
  '.....#..........'
])

const CARET_DOWN = rows(6, [
  '....########....',
  '.....######.....',
  '......####......',
  '.......##.......'
])

const ARROW_RIGHT = rows(3, [
  '.........#......',
  '.........##.....',
  '.........###....',
  '.........####...',
  '.#############..',
  '.#############..',
  '.........####...',
  '.........###....',
  '.........##.....',
  '.........#......'
])

const DOUBLE_ARROW = rows(4, [
  '...#........#...',
  '..##........##..',
  '.###........###.',
  '################',
  '################',
  '.###........###.',
  '..##........##..',
  '...#........#...'
])

export const GLYPHS = {
  check: art(
    rows(3, [
      '............##..',
      '...........###..',
      '..........###...',
      '.##......###....',
      '.###....###.....',
      '..###..###......',
      '...######.......',
      '....####........',
      '.....##.........'
    ])
  ),
  cross: art(
    rows(2, [
      '...##......##...',
      '...###....###...',
      '....###..###....',
      '.....######.....',
      '......####......',
      '......####......',
      '.....######.....',
      '....###..###....',
      '...###....###...',
      '...##......##...'
    ])
  ),
  warning: art(
    rows(1, [
      '.......##.......',
      '.......##.......',
      '......####......',
      '......#..#......',
      '.....##..##.....',
      '.....##..##.....',
      '....###..###....',
      '....###..###....',
      '...##########...',
      '...####..####...',
      '..#####..#####..',
      '..############..'
    ])
  ),
  play: art(PLAY),
  prev: art(flipX(PLAY)),
  up: art(transpose(flipX(PLAY))),
  down: art(transpose(PLAY)),
  pause: draw((a) => a.rect(3, 3, 4, 10).rect(9, 3, 4, 10)),
  stop: draw((a) => a.rect(3, 3, 10, 10)),
  caretDown: art(CARET_DOWN),
  caretRight: art(transpose(CARET_DOWN)),
  dot: art(
    rows(4, [
      '......####......',
      '.....######.....',
      '....########....',
      '....########....',
      '....########....',
      '....########....',
      '.....######.....',
      '......####......'
    ])
  ),
  ring: art(
    rows(4, [
      '......####......',
      '.....#....#.....',
      '....#......#....',
      '....#......#....',
      '....#......#....',
      '....#......#....',
      '.....#....#.....',
      '......####......'
    ])
  ),
  arrowRight: art(ARROW_RIGHT),
  arrowLeft: art(flipX(ARROW_RIGHT)),
  flipH: art(DOUBLE_ARROW),
  flipV: art(transpose(DOUBLE_ARROW)),
  swap: art(
    rows(2, [
      '..........#.....',
      '..........##....',
      '.############...',
      '.############...',
      '..........##....',
      '..........#.....',
      '................',
      '.....#..........',
      '....##..........',
      '...############.',
      '...############.',
      '....##..........',
      '.....#..........'
    ])
  ),
  reset: draw((a) =>
    a.ring(8, 8.5, 6.5, 2).clear(9, 0, 7, 8).rect(10, 7, 6, 1).rect(11, 6, 4, 1).rect(12, 5, 2, 1)
  ),
  dice: draw((a, b) => {
    b.rect(3, 3, 10, 10)
    a.box(2, 2, 12, 12).rect(5, 5, 2, 2).rect(7, 7, 2, 2).rect(9, 9, 2, 2)
  }),
  camera: draw((a, b) => {
    a.rect(5, 3, 6, 2).box(1, 5, 14, 9).ring(8, 9.5, 3.5, 1.3).p(12, 7)
    b.rect(2, 6, 12, 7)
  }),
  clock: draw((a, b) => {
    b.disc(8, 8, 6)
    a.ring(8, 8, 7.5, 1.5).rect(7, 4, 2, 5).rect(9, 7, 3, 2)
  }),
  gamepad: draw((a) =>
    a
      .rect(2, 5, 12, 7)
      .rect(1, 6, 14, 5)
      .clear(6, 11, 4, 1)
      .clear(3, 8, 3, 1)
      .clear(4, 7, 1, 3)
      .clear(11, 7)
      .clear(10, 8)
      .clear(12, 8)
      .clear(11, 9)
  ),
  chart: draw((a, b) => {
    a.rect(2, 9, 3, 5).rect(6, 5, 3, 9).rect(10, 2, 3, 12)
    b.rect(1, 14, 14, 1)
  }),
  gear: draw((a) =>
    a
      .disc(8, 8, 5.2)
      .rect(7, 1, 2, 14)
      .rect(1, 7, 14, 2)
      .rect(3, 3, 2, 2)
      .rect(11, 3, 2, 2)
      .rect(3, 11, 2, 2)
      .rect(11, 11, 2, 2)
      .clear(7, 6, 2, 4)
      .clear(6, 7, 4, 2)
  ),
  resize: draw((a) =>
    a.line(4, 10, 10, 4, 2).rect(9, 2, 5, 2).rect(12, 2, 2, 5).rect(2, 12, 5, 2).rect(2, 9, 2, 5)
  ),
  /** Connected glass: one frame, the shine running across where the blocks meet. */
  connected: draw((a, b) => {
    b.rect(2, 2, 12, 12)
    a.box(1, 1, 14, 14).line(3, 8, 8, 3).line(7, 12, 12, 7)
  }),
  /** A pointed leaf along the diagonal: shaded blade, full-colour vein and stem. */
  leaf: draw((a, b) => {
    for (let x = 0; x < 16; x++) {
      for (let y = 0; y < 16; y++) {
        const dx = x + 0.5 - 9
        const dy = y + 0.5 - 7
        const along = (dx - dy) / Math.SQRT2
        const across = (dx + dy) / Math.SQRT2
        if (Math.abs(along) > 6.5) continue
        const half = 3.4 * (1 - (along / 6.5) ** 2)
        if (Math.abs(across) <= 0.6) a.p(x, y)
        else if (Math.abs(across) <= half) b.p(x, y)
      }
    }
    a.line(2, 14, 4, 12)
  }),
  film: draw((a, b) => {
    a.rect(1, 2, 3, 12).rect(12, 2, 3, 12).box(4, 2, 8, 12)
    for (const y of [4, 7, 10]) a.clear(2, y).clear(13, y)
    b.rect(5, 3, 6, 10)
  }),
  book: art(
    rows(2, [
      '..############..',
      '..##+++++++++#..',
      '..##+++++++++#..',
      '..##++#####++#..',
      '..##+++++++++#..',
      '..##++#####++#..',
      '..##+++++++++#..',
      '..##+++++++++#..',
      '..##+++++++++#..',
      '..##+++++++++#..',
      '..############..'
    ])
  )
} satisfies Record<string, PixelIconData>

export type GlyphName = keyof typeof GLYPHS
