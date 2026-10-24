import { zlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { decodePng, encodeIndexedPng, encodePng, optimizePng, type RgbaImage } from './pngCodec'

// Builds PNG files by hand (filter 0 rows) so the decoder is tested against the spec, not
// against our own encoder.
function chunk(type: string, body: number[] | Uint8Array): number[] {
  const bytes = [...body]
  const typed = [...type].map((c) => c.charCodeAt(0))
  const len = bytes.length
  return [
    len >>> 24,
    (len >>> 16) & 255,
    (len >>> 8) & 255,
    len & 255,
    ...typed,
    ...bytes,
    ...crc([...typed, ...bytes])
  ]
}

function crc(bytes: number[]): number[] {
  let c = 0xffffffff
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  c = (c ^ 0xffffffff) >>> 0
  return [c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]
}

function png(
  width: number,
  height: number,
  depth: number,
  colorType: number,
  rows: number[][],
  extra: Array<[string, number[]]> = [],
  interlace = 0
): Uint8Array {
  const ihdr = [
    ...[width >>> 24, (width >>> 16) & 255, (width >>> 8) & 255, width & 255],
    ...[height >>> 24, (height >>> 16) & 255, (height >>> 8) & 255, height & 255],
    depth,
    colorType,
    0,
    0,
    interlace
  ]
  const raw = Uint8Array.from(rows.flatMap((row) => [0, ...row]))
  return Uint8Array.from([
    137,
    80,
    78,
    71,
    13,
    10,
    26,
    10,
    ...chunk('IHDR', ihdr),
    ...extra.flatMap(([type, body]) => chunk(type, body)),
    ...chunk('IDAT', zlibSync(raw)),
    ...chunk('IEND', [])
  ])
}

function pixels(result: ReturnType<typeof decodePng>): number[][] {
  if (!result.ok) throw new Error(result.error)
  const out: number[][] = []
  for (let i = 0; i < result.image.data.length; i += 4)
    out.push([...result.image.data.subarray(i, i + 4)])
  return out
}

describe('decodePng', () => {
  it('reads 8-bit RGBA exactly, including semi-transparent pixels', () => {
    const file = png(2, 1, 8, 6, [[10, 20, 30, 1, 200, 100, 50, 128]])
    expect(pixels(decodePng(file))).toEqual([
      [10, 20, 30, 1],
      [200, 100, 50, 128]
    ])
  })

  it('reads 4-bit palette images with tRNS alpha', () => {
    const palette = [255, 0, 0, 0, 255, 0, 0, 0, 255]
    // Indices 0,1,2,1 packed two per byte.
    const file = png(
      4,
      1,
      4,
      3,
      [[0x01, 0x21]],
      [
        ['PLTE', palette],
        ['tRNS', [255, 0]]
      ]
    )
    expect(pixels(decodePng(file))).toEqual([
      [255, 0, 0, 255],
      [0, 255, 0, 0],
      [0, 0, 255, 255],
      [0, 255, 0, 0]
    ])
  })

  it('reads 1-bit grayscale with a transparent key', () => {
    const file = png(3, 1, 1, 0, [[0b10100000]], [['tRNS', [0, 0]]])
    expect(pixels(decodePng(file))).toEqual([
      [255, 255, 255, 255],
      [0, 0, 0, 0],
      [255, 255, 255, 255]
    ])
  })

  it('reads gray + alpha and 16-bit RGB (keeping the high byte)', () => {
    expect(pixels(decodePng(png(1, 1, 8, 4, [[77, 99]])))).toEqual([[77, 77, 77, 99]])
    const deep = decodePng(png(1, 1, 16, 2, [[0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]]))
    expect(pixels(deep)).toEqual([[0x12, 0x56, 0x9a, 255]])
    expect(deep.ok && deep.image.reducedFrom16Bit).toBe(true)
  })

  it('applies RGB tRNS keys', () => {
    const file = png(2, 1, 8, 2, [[1, 2, 3, 4, 5, 6]], [['tRNS', [0, 4, 0, 5, 0, 6]]])
    expect(pixels(decodePng(file))).toEqual([
      [1, 2, 3, 255],
      [4, 5, 6, 0]
    ])
  })

  it('reads Adam7 interlaced images', () => {
    // 2×2 RGBA: pass 1 has (0,0), pass 6 has (1,0), pass 7 has row 1.
    const a = [1, 1, 1, 255]
    const b = [2, 2, 2, 255]
    const c = [3, 3, 3, 255]
    const d = [4, 4, 4, 255]
    const file = png(2, 2, 8, 6, [a, b, [...c, ...d]], [], 1)
    expect(pixels(decodePng(file))).toEqual([a, b, c, d])
  })

  it('round-trips every filter the encoder may pick', () => {
    const width = 7
    const height = 5
    const data = new Uint8Array(width * height * 4)
    let seed = 42
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      // Mix of noise and smooth gradients so different rows prefer different filters.
      data[i] = i % 3 === 0 ? seed & 255 : (i * 7) & 255
    }
    const image: RgbaImage = { width, height, data }
    const decoded = decodePng(encodePng(image))
    expect(decoded.ok && [...decoded.image.data]).toEqual([...data])
  })

  it('rejects broken files with an Italian message', () => {
    expect(decodePng(new Uint8Array([1, 2, 3]))).toEqual({
      ok: false,
      error: 'Il file non è un PNG.'
    })
    const truncated = png(2, 2, 8, 6, [[1, 2, 3, 4, 5, 6, 7, 8]])
    const result = decodePng(truncated)
    expect(result.ok).toBe(false)
  })

  it('rejects absurd sizes before inflating', () => {
    const file = png(20000, 1, 8, 6, [[]])
    expect(decodePng(file).ok).toBe(false)
  })

  it('inflates no more than the rows need (a 1×1 image with 4 MB of IDAT stays 1×1)', () => {
    // Row 0 is the real pixel; the rest is padding a decompression bomb would add.
    const rows = [[9, 8, 7, 255], ...Array.from({ length: 1024 }, () => new Array(4096).fill(0))]
    const file = png(1, 1, 8, 6, rows)
    expect(file.length).toBeLessThan(20_000)
    expect(pixels(decodePng(file))).toEqual([[9, 8, 7, 255]])
  })
})

describe('optimizePng', () => {
  const image = (width: number, height: number, pixel: (x: number, y: number) => number[]) => {
    const data = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4)
    return { width, height, data }
  }
  const same = (a: Uint8Array, b: Uint8Array) =>
    a.length === b.length && a.every((v, i) => v === b[i])

  it('writes few-colour textures as an indexed PNG that decodes to the same pixels', () => {
    for (const colours of [2, 4, 16, 200]) {
      const source = image(16, 16, (x, y) => {
        const n = (x * 16 + y) % colours
        return [n, 255 - n, (n * 7) % 256, n % 3 === 0 ? 0 : n % 3 === 1 ? 128 : 255]
      })
      const indexed = encodeIndexedPng(source)!
      const back = decodePng(indexed)
      expect(back.ok && same(back.image.data, source.data), `${colours} colours`).toBe(true)
    }
  })

  it('refuses more than 256 colours and never makes a file bigger', () => {
    const many = image(32, 32, (x, y) => [x * 8, y * 8, (x * y) % 256, 255])
    expect(encodeIndexedPng(many)).toBeNull()
    const original = encodePng(image(16, 16, (x) => [x * 16, 0, 0, 255]))
    const optimized = optimizePng(original)
    expect(optimized.length).toBeLessThanOrEqual(original.length)
    const back = decodePng(optimized)
    const first = decodePng(original)
    expect(back.ok && first.ok && same(back.image.data, first.image.data)).toBe(true)
    // Not a PNG: returned as it is.
    const junk = Uint8Array.from([1, 2, 3])
    expect(optimizePng(junk)).toBe(junk)
  })
})
