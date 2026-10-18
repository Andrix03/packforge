// Test resource pack for UI scenarios: a few small textures written with a minimal PNG encoder
// (scripts run as plain Node and cannot import the TypeScript sources).

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { zipSync } from 'fflate'
import { deflateSync } from 'node:zlib'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = ~0
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8)
  return ~c >>> 0
}

function chunk(type, body) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(body.length)
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

/** RGBA8 PNG from `pixel(x, y) → [r, g, b, a]`. */
export function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/** Zips a folder (paths with forward slashes, like real packs) and returns the zip path. */
export async function zipFolder(folder, zipPath) {
  const files = {}
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else files[relative(folder, full).split(sep).join('/')] = new Uint8Array(await readFile(full))
    }
  }
  await walk(folder)
  await writeFile(zipPath, zipSync(files))
  return zipPath
}

/** Gray stone-like pattern; value of pixel (x, y) is predictable for assertions. */
export const stoneValue = (x, y) => 110 + ((x * 7 + y * 13) % 5) * 12

/** Creates the test pack in `dir` (pack format 46 = 1.21.4) and returns its texture folder. */
export async function createTestPack(dir) {
  const block = join(dir, 'assets', 'minecraft', 'textures', 'block')
  await mkdir(block, { recursive: true })
  await writeFile(
    join(dir, 'pack.mcmeta'),
    JSON.stringify({ pack: { pack_format: 46, description: 'PackForge test pack' } })
  )
  const stone = png(16, 16, (x, y) => {
    const v = stoneValue(x, y)
    return [v, v, v + 4, 255]
  })
  await writeFile(join(block, 'stone.png'), stone)
  await writeFile(join(block, 'grass_block_top.png'), stone)
  await writeFile(
    join(block, 'glass.png'),
    png(16, 16, (x, y) =>
      x === 0 || y === 0 || x === 15 || y === 15
        ? [200, 230, 240, 255]
        : x === y
          ? [255, 255, 255, 255]
          : [0, 0, 0, 0]
    )
  )
  await writeFile(
    join(block, 'oak_planks.png'),
    png(32, 32, (x, y) => [150 + (y % 8) * 6, 110 + (x % 3) * 5, 60, 255])
  )
  // Large texture for performance checks (512×512, a few big areas plus a pattern).
  await writeFile(
    join(block, 'big.png'),
    png(512, 512, (x, y) =>
      x < 256 ? [90 + ((x * 7 + y * 13) % 5) * 10, 90, 90, 255] : [40, 120, 200, 255]
    )
  )
  // Animated: 3 frames of 16×16 (red, green, blue), 2 ticks each.
  const frameColors = [
    [200, 40, 30, 255],
    [40, 180, 60, 255],
    [40, 60, 200, 255]
  ]
  await writeFile(
    join(block, 'magma.png'),
    png(16, 48, (x, y) => frameColors[Math.floor(y / 16)])
  )
  await writeFile(
    join(block, 'magma.png.mcmeta'),
    JSON.stringify({ animation: { frametime: 2 } }, null, 2)
  )
  return block
}
