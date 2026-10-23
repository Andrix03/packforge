// Exact PNG decode/encode to and from straight (non-premultiplied) RGBA8.
// Browsers decode through a premultiplied canvas, which rounds semi-transparent pixels; the editor
// must save exactly what the user painted, so it uses this codec instead. Pure: no DOM, no Node.

import { unzlibSync, zlibSync } from 'fflate'
import { isPng, PNG_SIGNATURE } from './png'
import { tr } from './i18n'

export interface RgbaImage {
  width: number
  height: number
  /** width * height * 4 bytes, straight alpha. */
  data: Uint8Array
}

export interface DecodedPng extends RgbaImage {
  /** True when the file had 16-bit channels: saving keeps only the high byte. */
  reducedFrom16Bit: boolean
}

export type DecodeResult = { ok: true; image: DecodedPng } | { ok: false; error: string }

/** Largest side accepted, in pixels (64× textures are 1024, animation strips can be taller). */
export const MAX_IMAGE_SIDE = 16384
export const MAX_IMAGE_PIXELS = 16 * 1024 * 1024

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const VALID_DEPTHS: Record<number, number[]> = {
  0: [1, 2, 4, 8, 16],
  2: [8, 16],
  3: [1, 2, 4, 8],
  4: [8, 16],
  6: [8, 16]
}
// Adam7 passes: x start, y start, x step, y step.
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2]
] as const

export function decodePng(bytes: Uint8Array): DecodeResult {
  try {
    return { ok: true, image: decode(bytes) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof PngError ? error.message : tr('PNG non leggibile.')
    }
  }
}

class PngError extends Error {}

function decode(bytes: Uint8Array): DecodedPng {
  if (!isPng(bytes)) throw new PngError(tr('Il file non è un PNG.'))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  let header: {
    width: number
    height: number
    depth: number
    colorType: number
    interlace: number
  } | null = null
  let palette: Uint8Array | null = null
  let transparency: Uint8Array | null = null
  const idat: Uint8Array[] = []

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    if (body.length !== length) throw new PngError('PNG troncato.')
    offset += 12 + length
    if (type === 'IHDR') {
      if (length < 13) throw new PngError(tr('PNG senza intestazione.'))
      const ihdr = new DataView(body.buffer, body.byteOffset, body.byteLength)
      header = {
        width: ihdr.getUint32(0),
        height: ihdr.getUint32(4),
        depth: body[8]!,
        colorType: body[9]!,
        interlace: body[12]!
      }
    } else if (type === 'PLTE') palette = body
    else if (type === 'tRNS') transparency = body
    else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
  }
  if (!header) throw new PngError(tr('PNG senza intestazione.'))
  const { width, height, depth, colorType, interlace } = header
  if (!VALID_DEPTHS[colorType]?.includes(depth)) throw new PngError(tr('Formato PNG non valido.'))
  if (width === 0 || height === 0 || width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    throw new PngError(tr('Dimensioni del PNG non supportate.'))
  }
  if (width * height > MAX_IMAGE_PIXELS) throw new PngError(tr('Il PNG è troppo grande.'))
  if (colorType === 3 && !palette) throw new PngError(tr('PNG a palette senza palette.'))

  const channels = CHANNELS[colorType]!
  const bitsPerPixel = channels * depth
  const bytesPerPixel = Math.max(1, bitsPerPixel >> 3)
  const passes = interlace === 1 ? ADAM7 : ([[0, 0, 1, 1]] as const)
  // Inflate into a buffer of exactly the size the rows need: a "zip bomb" IDAT can't grow it
  // (fflate drops what doesn't fit), and anything shorter is reported as truncated below.
  let expected = 0
  for (const [x0, y0, dx, dy] of passes) {
    const passWidth = Math.ceil((width - x0) / dx)
    const passHeight = Math.ceil((height - y0) / dy)
    if (passWidth > 0 && passHeight > 0) {
      expected += passHeight * (1 + Math.ceil((passWidth * bitsPerPixel) / 8))
    }
  }
  const raw = unzlibSync(concat(idat), { out: new Uint8Array(expected) })
  const out = new Uint8Array(width * height * 4)
  const pixel = pixelReader(colorType, depth, palette, transparency)

  let position = 0
  for (const [x0, y0, dx, dy] of passes) {
    const passWidth = Math.ceil((width - x0) / dx)
    const passHeight = Math.ceil((height - y0) / dy)
    if (passWidth <= 0 || passHeight <= 0) continue
    const stride = Math.ceil((passWidth * bitsPerPixel) / 8)
    let previous = new Uint8Array(stride)
    for (let row = 0; row < passHeight; row++) {
      if (position + 1 + stride > raw.length) throw new PngError('PNG troncato.')
      const filter = raw[position]!
      const line = raw.slice(position + 1, position + 1 + stride)
      position += 1 + stride
      unfilter(filter, line, previous, bytesPerPixel)
      for (let col = 0; col < passWidth; col++) {
        const target = ((y0 + row * dy) * width + x0 + col * dx) * 4
        pixel(line, col, out, target)
      }
      previous = line
    }
  }
  return { width, height, data: out, reducedFrom16Bit: depth === 16 }
}

type PixelReader = (line: Uint8Array, col: number, out: Uint8Array, target: number) => void

function pixelReader(
  colorType: number,
  depth: number,
  palette: Uint8Array | null,
  trns: Uint8Array | null
): PixelReader {
  const sample = (line: Uint8Array, index: number): number => {
    if (depth === 8) return line[index]!
    if (depth === 16) return line[index * 2]!
    const perByte = 8 / depth
    const byte = line[Math.floor(index / perByte)]!
    const shift = 8 - depth * ((index % perByte) + 1)
    return (byte >> shift) & ((1 << depth) - 1)
  }
  // Raw sample value (before scaling), used to match tRNS keys.
  const rawSample = (line: Uint8Array, index: number): number =>
    depth === 16 ? (line[index * 2]! << 8) | line[index * 2 + 1]! : sample(line, index)
  const scale = depth < 8 ? 255 / ((1 << depth) - 1) : 1

  switch (colorType) {
    case 0: {
      const key = trns && trns.length >= 2 ? (trns[0]! << 8) | trns[1]! : -1
      return (line, col, out, t) => {
        const v = Math.round(sample(line, col) * scale)
        out.set([v, v, v, rawSample(line, col) === key ? 0 : 255], t)
      }
    }
    case 2: {
      const key =
        trns && trns.length >= 6
          ? [(trns[0]! << 8) | trns[1]!, (trns[2]! << 8) | trns[3]!, (trns[4]! << 8) | trns[5]!]
          : null
      return (line, col, out, t) => {
        const i = col * 3
        const transparent =
          key !== null &&
          rawSample(line, i) === key[0] &&
          rawSample(line, i + 1) === key[1] &&
          rawSample(line, i + 2) === key[2]
        out.set(
          [sample(line, i), sample(line, i + 1), sample(line, i + 2), transparent ? 0 : 255],
          t
        )
      }
    }
    case 3:
      return (line, col, out, t) => {
        const index = sample(line, col)
        if (index * 3 + 2 >= palette!.length)
          throw new PngError(tr('Indice di palette non valido.'))
        out.set(
          [
            palette![index * 3]!,
            palette![index * 3 + 1]!,
            palette![index * 3 + 2]!,
            trns?.[index] ?? 255
          ],
          t
        )
      }
    case 4:
      return (line, col, out, t) => {
        const v = sample(line, col * 2)
        out.set([v, v, v, sample(line, col * 2 + 1)], t)
      }
    default:
      return (line, col, out, t) => {
        const i = col * 4
        out.set([sample(line, i), sample(line, i + 1), sample(line, i + 2), sample(line, i + 3)], t)
      }
  }
}

function unfilter(filter: number, line: Uint8Array, previous: Uint8Array, bpp: number): void {
  for (let i = 0; i < line.length; i++) {
    const left = i >= bpp ? line[i - bpp]! : 0
    const up = previous[i]!
    const upLeft = i >= bpp ? previous[i - bpp]! : 0
    let add: number
    switch (filter) {
      case 0:
        add = 0
        break
      case 1:
        add = left
        break
      case 2:
        add = up
        break
      case 3:
        add = (left + up) >> 1
        break
      case 4:
        add = paeth(left, up, upLeft)
        break
      default:
        throw new PngError(tr('Filtro PNG non valido.'))
    }
    line[i] = (line[i]! + add) & 0xff
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/**
 * Encodes RGBA8 as a non-interlaced 8-bit RGBA PNG. Each row uses the filter with the smallest
 * sum of absolute values (the usual heuristic), then zlib at maximum compression.
 */
export function encodePng(image: RgbaImage): Uint8Array {
  const { width, height, data } = image
  const stride = width * 4
  const raw = new Uint8Array((stride + 1) * height)
  let previous: Uint8Array = new Uint8Array(stride)
  const candidate = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const line = data.subarray(y * stride, (y + 1) * stride)
    let best = 0
    let bestScore = Infinity
    let bestLine = new Uint8Array(stride)
    for (let filter = 0; filter <= 4; filter++) {
      let score = 0
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? line[i - 4]! : 0
        const up = previous[i]!
        const upLeft = i >= 4 ? previous[i - 4]! : 0
        const predicted =
          filter === 0
            ? 0
            : filter === 1
              ? left
              : filter === 2
                ? up
                : filter === 3
                  ? (left + up) >> 1
                  : paeth(left, up, upLeft)
        const value = (line[i]! - predicted) & 0xff
        candidate[i] = value
        score += value < 128 ? value : 256 - value
      }
      if (score < bestScore) {
        bestScore = score
        best = filter
        bestLine = candidate.slice()
      }
    }
    raw[y * (stride + 1)] = best
    raw.set(bestLine, y * (stride + 1) + 1)
    previous = line
  }

  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, width)
  ihdrView.setUint32(4, height)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return concat([
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0))
  ])
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

let crcTable: Uint32Array | null = null

function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
