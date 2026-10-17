import { describe, expect, it } from 'vitest'
import { isPng, readPngSize, validatePackIcon } from './png'

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12) // "IHDR"
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

describe('readPngSize', () => {
  it('reads IHDR width and height', () => {
    expect(readPngSize(pngHeader(128, 64))).toEqual({ width: 128, height: 64 })
  })

  it('rejects non-PNGs, truncated data and broken headers', () => {
    expect(readPngSize(new TextEncoder().encode('GIF89a nope nope nope nope'))).toBeNull()
    expect(readPngSize(pngHeader(16, 16).slice(0, 20))).toBeNull()
    const wrongChunk = pngHeader(16, 16)
    wrongChunk[12] = 0x58
    expect(readPngSize(wrongChunk)).toBeNull()
    expect(readPngSize(pngHeader(0, 16))).toBeNull()
  })

  it('works on views into a larger buffer', () => {
    const big = new Uint8Array(100)
    big.set(pngHeader(32, 32), 10)
    expect(readPngSize(big.subarray(10))).toEqual({ width: 32, height: 32 })
  })
})

describe('validatePackIcon', () => {
  it('accepts square PNGs in range', () => {
    expect(validatePackIcon(pngHeader(64, 64))).toBeNull()
    expect(validatePackIcon(pngHeader(16, 16))).toBeNull()
    expect(validatePackIcon(pngHeader(1024, 1024))).toBeNull()
  })

  it('rejects non-square, too small/large and non-PNG data', () => {
    expect(validatePackIcon(pngHeader(64, 32))).not.toBeNull()
    expect(validatePackIcon(pngHeader(8, 8))).not.toBeNull()
    expect(validatePackIcon(pngHeader(2048, 2048))).not.toBeNull()
    expect(validatePackIcon(new Uint8Array(40))).not.toBeNull()
    expect(isPng(new Uint8Array(4))).toBe(false)
  })
})
