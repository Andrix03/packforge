// README animation: turns the frames written by scripts/drive/tours/readme.mjs (NNN-<ms>.png) into
// .github/assets/demo.gif. Scales down, crops the status bar (it shows the local path), builds one
// 256-colour palette for all frames (median cut) and stores each frame as the rectangle that
// changed. Usage: node scripts/make-demo-gif.mjs <framesDir> [width=880] [out]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const [dir, widthArg, outArg] = process.argv.slice(2)
const WIDTH = Number(widthArg ?? 880)
const OUT = outArg ?? '.github/assets/demo.gif'
const CROP_BOTTOM = 26

/** 8-bit RGB/RGBA non-interlaced PNG (what Chromium screenshots are) → { w, h, rgb }. */
function readPng(file) {
  const buf = readFileSync(file)
  let pos = 8
  let w = 0
  let h = 0
  let type = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const tag = buf.toString('latin1', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (tag === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      type = data[9]
      if (data[8] !== 8 || data[12] !== 0 || (type !== 2 && type !== 6))
        throw new Error(`${file}: unsupported PNG`)
    } else if (tag === 'IDAT') idat.push(data)
    pos += 12 + len
  }
  const bpp = type === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const px = new Uint8Array(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]
      const a = x >= bpp ? px[y * stride + x - bpp] : 0
      const b = y > 0 ? px[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0
      const p = a + b - c
      const pa = Math.abs(p - a)
      const pb = Math.abs(p - b)
      const pc = Math.abs(p - c)
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      px[y * stride + x] = (v + [0, a, b, (a + b) >> 1, paeth][f]) & 255
    }
  }
  const rgb = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) rgb[i * 3 + k] = px[i * bpp + k]
  return { w, h, rgb }
}

/** Box-filter downscale to `width` (keeps the aspect), after cropping the bottom rows. */
function scale({ w, h, rgb }, width) {
  const srcH = h - CROP_BOTTOM
  const f = w / width
  const height = Math.round(srcH / f)
  const out = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * f)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * f))
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * f)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * f))
      const sum = [0, 0, 0]
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++)
          for (let k = 0; k < 3; k++) sum[k] += rgb[(yy * w + xx) * 3 + k]
      const n = (y1 - y0) * (x1 - x0)
      for (let k = 0; k < 3; k++) out[(y * width + x) * 3 + k] = Math.round(sum[k] / n)
    }
  }
  return { w: width, h: height, rgb: out }
}

/** Median cut over 15-bit colour counts of every frame: 256 colours. */
function palette(images) {
  const counts = new Map()
  for (const { rgb } of images)
    for (let i = 0; i < rgb.length; i += 3) {
      const key = ((rgb[i] >> 3) << 10) | ((rgb[i + 1] >> 3) << 5) | (rgb[i + 2] >> 3)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  const colors = [...counts].map(([k, n]) => ({
    c: [((k >> 10) << 3) | 4, (((k >> 5) & 31) << 3) | 4, ((k & 31) << 3) | 4],
    n
  }))
  let boxes = [colors]
  while (boxes.length < 256) {
    let best = -1
    let bestRange = 0
    let bestAxis = 0
    boxes.forEach((box, i) => {
      if (box.length < 2) return
      for (let axis = 0; axis < 3; axis++) {
        let lo = 255
        let hi = 0
        for (const { c } of box) {
          lo = Math.min(lo, c[axis])
          hi = Math.max(hi, c[axis])
        }
        // Weight by population so busy regions (the UI greys) get more colours.
        const weight = (hi - lo) * Math.log2(2 + box.reduce((s, e) => s + e.n, 0))
        if (weight > bestRange) {
          bestRange = weight
          best = i
          bestAxis = axis
        }
      }
    })
    if (best < 0) break
    const box = boxes[best].sort((a, b) => a.c[bestAxis] - b.c[bestAxis])
    const total = box.reduce((s, e) => s + e.n, 0)
    let acc = 0
    let cut = 1
    for (; cut < box.length - 1; cut++) {
      acc += box[cut - 1].n
      if (acc >= total / 2) break
    }
    boxes.splice(best, 1, box.slice(0, cut), box.slice(cut))
  }
  return boxes.map((box) => {
    const total = box.reduce((s, e) => s + e.n, 0)
    return [0, 1, 2].map((k) => Math.round(box.reduce((s, e) => s + e.c[k] * e.n, 0) / total))
  })
}

function indexer(pal) {
  const cache = new Map()
  return (r, g, b) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)
    let i = cache.get(key)
    if (i === undefined) {
      let best = Infinity
      pal.forEach((c, j) => {
        const d = (c[0] - r) ** 2 * 3 + (c[1] - g) ** 2 * 4 + (c[2] - b) ** 2 * 2
        if (d < best) {
          best = d
          i = j
        }
      })
      cache.set(key, i)
    }
    return i
  }
}

function lzw(indices, minCode) {
  const clear = 1 << minCode
  const end = clear + 1
  let size = minCode + 1
  let next = end + 1
  let dict = new Map()
  const out = []
  let cur = 0
  let bits = 0
  const emit = (code) => {
    cur |= code << bits
    bits += size
    while (bits >= 8) {
      out.push(cur & 255)
      cur >>= 8
      bits -= 8
    }
  }
  emit(clear)
  let prefix = indices[0]
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]
    const key = prefix * 256 + k
    const found = dict.get(key)
    if (found !== undefined) {
      prefix = found
      continue
    }
    emit(prefix)
    if (next < 4096) {
      dict.set(key, next++)
      if (next > 1 << size && size < 12) size++
    } else {
      emit(clear)
      dict = new Map()
      size = minCode + 1
      next = end + 1
    }
    prefix = k
  }
  emit(prefix)
  emit(end)
  if (bits > 0) out.push(cur & 255)
  return out
}

const files = readdirSync(dir)
  .filter((f) => /^\d+-\d+\.png$/.test(f))
  .sort()
if (files.length === 0) throw new Error(`no frames in ${dir}`)
const images = files.map((f) => scale(readPng(join(dir, f)), WIDTH))
const pal = palette(images)
const index = indexer(pal)
const { w, h } = images[0]
const bytes = [...Buffer.from('GIF89a', 'latin1')]
const u16 = (v) => bytes.push(v & 255, v >> 8)
u16(w)
u16(h)
bytes.push(0xf7, 0, 0)
for (let i = 0; i < 256; i++) bytes.push(...(pal[i] ?? [0, 0, 0]))
bytes.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0', 'latin1'), 3, 1, 0, 0, 0)
let previous = null
images.forEach((img, fi) => {
  const idx = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++)
    idx[i] = index(img.rgb[i * 3], img.rgb[i * 3 + 1], img.rgb[i * 3 + 2])
  // Only the rectangle that changed since the previous frame.
  let x0 = 0
  let y0 = 0
  let x1 = w - 1
  let y1 = h - 1
  if (previous) {
    x0 = w
    y0 = h
    x1 = -1
    y1 = -1
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (idx[y * w + x] !== previous[y * w + x]) {
          x0 = Math.min(x0, x)
          y0 = Math.min(y0, y)
          x1 = Math.max(x1, x)
          y1 = Math.max(y1, y)
        }
    if (x1 < 0) x0 = y0 = x1 = y1 = 0
  }
  const delay = Math.round(Number(/-(\d+)\.png$/.exec(files[fi])[1]) / 10)
  bytes.push(0x21, 0xf9, 4, 0x04)
  u16(delay)
  bytes.push(0, 0, 0x2c)
  u16(x0)
  u16(y0)
  u16(x1 - x0 + 1)
  u16(y1 - y0 + 1)
  bytes.push(0)
  const sub = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) sub.push(idx[y * w + x])
  bytes.push(8)
  const data = lzw(sub, 8)
  for (let i = 0; i < data.length; i += 255) {
    const block = data.slice(i, i + 255)
    bytes.push(block.length, ...block)
  }
  bytes.push(0)
  previous = idx
})
bytes.push(0x3b)
writeFileSync(OUT, Buffer.from(bytes))
console.log(`${OUT}: ${files.length} frames, ${w}×${h}, ${(bytes.length / 1024).toFixed(0)} KB`)
