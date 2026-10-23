// Draws the app icon: a pack cube with a painted texture, forged over an anvil, amber spark
// (32×32 pixel art, approved on the design canvas). Writes build/icon.png (256×256, nearest ×8;
// electron-builder makes the .ico) and .github/assets/packforge.gif (the README animation).
// Run: npm run icon
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
  255
]
const C = {
  outline: hex('#141414'),
  // Top face: the "painted" texture (moss greens with gold), in the UI accents.
  g0: hex('#4c8a2a'),
  g1: hex('#5f9e35'),
  g2: hex('#8fd45a'),
  au: hex('#e8b44a'),
  auL: hex('#ffd96a'),
  bl: hex('#6fa8dc'),
  re: hex('#c0523a'),
  // Sides: forged stone, light on the left, shadow on the right.
  sL0: hex('#9a9a9a'),
  sL1: hex('#8a8a8a'),
  sL2: hex('#a8a8a8'),
  sR0: hex('#666666'),
  sR1: hex('#5a5a5a'),
  sR2: hex('#727272'),
  rim: hex('#c4c4c4'),
  seam: hex('#262626'),
  empty0: hex('#3a3a3a'),
  empty1: hex('#333333'),
  anvTop: hex('#7a7a80'),
  anv: hex('#4a4a50'),
  anvD: hex('#34343a'),
  spark: hex('#e8b44a'),
  sparkW: hex('#fff3c4')
}
const TOP3 = [
  ['g1', 'au', 'bl'],
  ['re', 'g2', 'au'],
  ['bl', 'g1', 're']
]
const TOP2 = [
  ['g1', 'au'],
  ['re', 'g2']
]
const SIDE_L = [
  ['sL2', 'sL1', 'sL0', 'sL1'],
  ['sL1', 'sL0', 'sL2', 'sL0'],
  ['sL0', 'sL1', 'sL1', 'sL2'],
  ['sL1', 'sL2', 'sL0', 'sL1']
]
const SIDE_R = [
  ['sR1', 'sR2', 'sR0', 'sR1'],
  ['sR0', 'sR1', 'sR1', 'sR2'],
  ['sR2', 'sR0', 'sR1', 'sR0'],
  ['sR1', 'sR0', 'sR2', 'sR1']
]

/**
 * Draws one frame. opts: { size: 32|16, painted: 0..16 top cells shown, sides: 0..1,
 * sweep: -1 or diagonal index lit, spark: 0..2, embers: [[x,y],...] }.
 */
function frame(opts) {
  const n = opts.size
  const big = n === 32
  const S = big ? 10 : 7 // cube edge in iso units
  const cx = n / 2,
    y0 = 1
  const cells = big ? 4 : 2
  const unit = S / cells
  const img = Array.from({ length: n }, () => Array(n).fill(null))
  const tc = big ? 3 : 2,
    tu = S / tc,
    TOP = big ? TOP3 : TOP2
  // Cells are painted along the diagonals (front to back), one by one.
  const order = []
  for (let k = 0; k <= 2 * (tc - 1); k++)
    for (let j = 0; j < tc; j++) {
      const i = k - j
      if (i >= 0 && i < tc) order.push(j * tc + i)
    }
  const paintedSet = new Set(order.slice(0, opts.painted ?? tc * tc))
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = x + 0.5,
        py = y + 0.5
      // Top face.
      const a = (px - cx + 2 * (py - y0)) / 2,
        b = (2 * (py - y0) - (px - cx)) / 2
      if (a >= 0 && a < S && b >= 0 && b < S) {
        const i = Math.floor(a / tu),
          j = Math.floor(b / tu)
        const on = paintedSet.has(j * tc + i)
        let col = on ? C[TOP[j][i]] : C[(i + j) % 2 ? 'empty0' : 'empty1']
        if (on && opts.sweep >= 0 && i + j === opts.sweep)
          col = col.map((v, k) => (k < 3 ? Math.min(255, v + 60) : v))
        img[y][x] = col
        continue
      }
      const sides = opts.sides ?? 1
      if (px >= cx) {
        const bb = cx + S - px,
          d = py - y0 - (S + bb) / 2
        if (bb >= 0 && bb <= S && d >= 0 && d < S) {
          const i = Math.min(cells - 1, Math.floor(bb / unit)),
            j = Math.floor(d / unit)
          img[y][x] =
            j / cells < sides
              ? C[SIDE_R[big ? j : j * 2][big ? i : i * 2]]
              : C[(i + j) % 2 ? 'empty0' : 'empty1']
          if (d < 1) img[y][x] = C.seam
        }
      } else {
        const aa = px - (cx - S),
          d = py - y0 - (aa + S) / 2
        if (aa >= 0 && aa <= S && d >= 0 && d < S) {
          const i = Math.min(cells - 1, Math.floor(aa / unit)),
            j = Math.floor(d / unit)
          img[y][x] =
            j / cells < sides
              ? C[SIDE_L[big ? j : j * 2][big ? i : i * 2]]
              : C[(i + j) % 2 ? 'empty0' : 'empty1']
          if (d < 1) img[y][x] = C.seam
          else if (aa > S - 1 && j / cells < sides) img[y][x] = C.rim
        }
      }
    }
  }
  if (big) {
    // Anvil (front view) under the cube.
    const rows = {
      22: [[7, 27, 'anvTop']],
      23: [[2, 27, 'anv']],
      24: [[4, 27, 'anv']],
      25: [[9, 25, 'anvD']],
      26: [[12, 20, 'anv']],
      27: [[12, 20, 'anvD']],
      28: [[10, 22, 'anv']],
      29: [[7, 25, 'anv']],
      30: [[7, 25, 'anvD']]
    }
    for (const [y, spans] of Object.entries(rows))
      for (const [x0, x1, c] of spans) for (let x = x0; x <= x1; x++) img[+y][x] = C[c]
  }
  // Silhouette outline (4-neighbour), drawn before sparks so sparks stay bright.
  const filled = (x, y) => x >= 0 && y >= 0 && x < n && y < n && img[y][x] !== null
  const out = img.map((row, y) =>
    row.map(
      (c, x) =>
        c ||
        (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)
          ? C.outline
          : null)
    )
  )
  // Spark at the top right: 0 off, 1 small, 2 full.
  const sp = opts.spark ?? 2
  if (sp) {
    const [sx, sy] = big ? [27, 4] : [13, 2]
    const r = big ? (sp === 2 ? 3 : 1) : 1
    for (let k = -r; k <= r; k++) {
      set(out, n, sx + k, sy, C.spark)
      set(out, n, sx, sy + k, C.spark)
    }
    set(out, n, sx, sy, C.sparkW)
    if (sp === 2 && big) {
      set(out, n, sx - 2, sy - 2, C.spark)
      set(out, n, sx + 2, sy + 2, C.spark)
      set(out, n, sx + 2, sy - 2, C.spark)
      set(out, n, sx - 2, sy + 2, C.spark)
    }
  }
  for (const [ex, ey] of opts.embers || []) set(out, n, ex, ey, C.spark)
  return out
}
function set(img, n, x, y, c) {
  if (x >= 0 && y >= 0 && x < n && y < n) img[y][x] = c
}

// ---------- PNG / ICO ----------
const crcT = Array.from({ length: 256 }, (_, k) => {
  let c = k
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (t, d) => {
  const l = Buffer.alloc(4)
  l.writeUInt32BE(d.length)
  const body = Buffer.concat([Buffer.from(t, 'latin1'), d])
  const s = Buffer.alloc(4)
  s.writeUInt32BE(crc(body))
  return Buffer.concat([l, body, s])
}
function png(art, scale) {
  const n = art.length,
    size = n * scale
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      raw.set(
        art[Math.floor(y / scale)][Math.floor(x / scale)] || [0, 0, 0, 0],
        y * (size * 4 + 1) + 1 + x * 4
      )
  const h = Buffer.alloc(13)
  h.writeUInt32BE(size, 0)
  h.writeUInt32BE(size, 4)
  h.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', h),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- GIF (palette + LZW) ----------
function gif(frames, scale, delays, bg) {
  const n = frames[0].length,
    size = n * scale
  const key = (c) => (c ? c.slice(0, 3).join(',') : 'bg')
  const pal = new Map([['bg', 0]])
  const colors = [bg]
  for (const f of frames)
    for (const row of f)
      for (const c of row) {
        const k = key(c)
        if (!pal.has(k)) {
          pal.set(k, colors.length)
          colors.push(c.slice(0, 3))
        }
      }
  let bits = 1
  while (1 << bits < colors.length) bits++
  const tableSize = 1 << bits
  const bytes = [...Buffer.from('GIF89a', 'latin1')]
  const u16 = (v) => {
    bytes.push(v & 255, v >> 8)
  }
  u16(size)
  u16(size)
  bytes.push(0xf0 | (bits - 1), 0, 0)
  for (let i = 0; i < tableSize; i++) {
    const c = colors[i] || [0, 0, 0]
    bytes.push(c[0], c[1], c[2])
  }
  bytes.push(0x21, 0xff, 11, ...Buffer.from('NETSCAPE2.0', 'latin1'), 3, 1, 0, 0, 0) // loop forever
  frames.forEach((f, fi) => {
    bytes.push(0x21, 0xf9, 4, 0x00)
    u16(delays[fi])
    bytes.push(0, 0)
    bytes.push(0x2c)
    u16(0)
    u16(0)
    u16(size)
    u16(size)
    bytes.push(0)
    const idx = new Uint8Array(size * size)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        idx[y * size + x] = pal.get(key(f[Math.floor(y / scale)][Math.floor(x / scale)]))
    const minCode = Math.max(2, bits)
    bytes.push(minCode)
    const data = lzw(idx, minCode)
    for (let i = 0; i < data.length; i += 255) {
      const part = data.slice(i, i + 255)
      bytes.push(part.length, ...part)
    }
    bytes.push(0)
  })
  bytes.push(0x3b)
  return Buffer.from(bytes)
}
function lzw(idx, minCode) {
  const clear = 1 << minCode,
    eoi = clear + 1
  let size = minCode + 1,
    next = eoi + 1
  let dict = new Map()
  const out = []
  let acc = 0,
    nb = 0
  const emit = (code) => {
    acc |= code << nb
    nb += size
    while (nb >= 8) {
      out.push(acc & 255)
      acc >>>= 8
      nb -= 8
    }
  }
  emit(clear)
  let cur = idx[0]
  for (let i = 1; i < idx.length; i++) {
    const k = idx[i],
      keyS = cur * 4096 + k
    if (dict.has(keyS)) {
      cur = dict.get(keyS)
      continue
    }
    emit(cur)
    if (next < 4096) {
      dict.set(keyS, next++)
      if (next > 1 << size && size < 12) size++
    } else {
      emit(clear)
      dict = new Map()
      size = minCode + 1
      next = eoi + 1
    }
    cur = k
  }
  emit(cur)
  emit(eoi)
  if (nb > 0) out.push(acc & 255)
  return out
}

// ---------- outputs ----------
const icon32 = frame({ size: 32, painted: 9, sides: 1, sweep: -1, spark: 2 })
mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', png(icon32, 8))

// Animation: paint the top cell by cell, then the sides, the spark strike with embers, a light sweep.
const frames = []
const delays = []
const push = (o, d) => {
  frames.push(frame({ size: 32, ...o }))
  delays.push(d)
}
push({ painted: 0, sides: 0, sweep: -1, spark: 0 }, 50)
for (let p = 1; p <= 9; p++) push({ painted: p, sides: 0, sweep: -1, spark: 0 }, 10)
for (let side = 1; side <= 4; side++) push({ painted: 9, sides: side / 4, sweep: -1, spark: 0 }, 8)
const EMBERS = [
  [
    [4, 21],
    [27, 21]
  ],
  [
    [3, 19],
    [28, 19],
    [6, 20]
  ],
  [
    [2, 17],
    [29, 18],
    [5, 18],
    [26, 17]
  ],
  [
    [1, 15],
    [30, 16],
    [4, 16]
  ]
]
for (let k = 0; k < 4; k++)
  push({ painted: 9, sides: 1, sweep: -1, spark: k < 2 ? 2 : 1, embers: EMBERS[k] }, 8)
for (let d = 0; d <= 4; d++) push({ painted: 9, sides: 1, sweep: d, spark: 1 }, 6)
push({ painted: 9, sides: 1, sweep: -1, spark: 2 }, 160)
mkdirSync('docs', { recursive: true })
writeFileSync('.github/assets/packforge.gif', gif(frames, 8, delays, [29, 29, 29]))
console.log('build/icon.png 256×256 · .github/assets/packforge.gif', frames.length, 'frames')
