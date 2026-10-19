// Draws the app icon (build/icon.png, 256×256): an isometric grass block as 32×32 pixel art,
// scaled ×8 (nearest). Run: node scripts/make-icon.mjs — electron-builder makes the .ico.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const N = 32
const SCALE = 8
const OUTLINE = [24, 26, 30, 255]

/** Deterministic pixel noise: the same icon on every run. */
const noise = (x, y) => ((x * 73856093) ^ (y * 19349663)) % 7 === 0

function shade(color, factor) {
  return [...color.slice(0, 3).map((c) => Math.round(c * factor)), 255]
}

/** Face of the cube at (x, y), or null outside. Top diamond, then the two sides 15 px tall. */
function pixel(x, y) {
  const cx = 15.5
  if (Math.abs(x - cx) / 2 + Math.abs(y - 8) <= 8) {
    return noise(x, y) ? [86, 160, 92, 255] : [111, 191, 115, 255]
  }
  const left = x < 16
  const edge = left ? 8 + (x + 0.5) / 2 : 16 - (x + 0.5 - 16) / 2
  if (y < edge || y > edge + 15) return null
  const depth = y - edge
  // Grass hangs over the top of the sides, dirt below; the right side is in shadow.
  const base =
    depth < 3
      ? noise(x, y)
        ? [86, 160, 92, 255]
        : [99, 175, 104, 255]
      : noise(x, y)
        ? [178, 134, 98, 255]
        : [150, 106, 72, 255]
  return left ? base : shade(base, 0.74)
}

const grid = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => pixel(x, y)))
const filled = (x, y) => x >= 0 && y >= 0 && x < N && y < N && grid[y][x] !== null
// Outline: filled pixels touching the outside.
const art = grid.map((row, y) =>
  row.map((color, x) => {
    if (!color) return [0, 0, 0, 0]
    const edge = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1) || !filled(x, y + 1)
    return edge ? OUTLINE : color
  })
)

const size = N * SCALE
const raw = Buffer.alloc(size * (size * 4 + 1))
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    raw.set(art[Math.floor(y / SCALE)][Math.floor(x / SCALE)], y * (size * 4 + 1) + 1 + x * 4)
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (bytes) => {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([length, body, sum])
}
const header = Buffer.alloc(13)
header.writeUInt32BE(size, 0)
header.writeUInt32BE(size, 4)
header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA

mkdirSync('build', { recursive: true })
writeFileSync(
  'build/icon.png',
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
)
console.log('build/icon.png', size)
