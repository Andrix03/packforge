// Pixel art helpers for the interface: 16×16 icons as SVG paths and small pictures (8×8 scenes,
// material swatches) as data-URI backgrounds. Pure: no DOM.

/** Cells of a square grid, written as an SVG path of horizontal runs ("M x y h w v1 h-w z"). */
export class PixelGrid {
  private readonly cells = new Set<number>()

  constructor(readonly size = 16) {}

  p(x: number, y: number): this {
    if (x >= 0 && y >= 0 && x < this.size && y < this.size) this.cells.add(y * this.size + x)
    return this
  }

  rect(x: number, y: number, w: number, h: number): this {
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) this.p(i, j)
    return this
  }

  /** Outline of a rectangle, `t` pixels thick. */
  box(x: number, y: number, w: number, h: number, t = 1): this {
    return this.rect(x, y, w, t)
      .rect(x, y + h - t, w, t)
      .rect(x, y, t, h)
      .rect(x + w - t, y, t, h)
  }

  /** Straight line of t×t squares from (x0, y0) to (x1, y1). */
  line(x0: number, y0: number, x1: number, y1: number, t = 1): this {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1
    for (let i = 0; i <= n; i++)
      this.rect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), t, t)
    return this
  }

  disc(cx: number, cy: number, r: number): this {
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        if (dx * dx + dy * dy <= r * r) this.p(x, y)
      }
    }
    return this
  }

  ring(cx: number, cy: number, r: number, w: number): this {
    for (let x = 0; x < this.size; x++) {
      for (let y = 0; y < this.size; y++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
        if (d <= r && d > r - w) this.p(x, y)
      }
    }
    return this
  }

  clear(x: number, y: number, w = 1, h = 1): this {
    for (let i = x; i < x + w; i++)
      for (let j = y; j < y + h; j++) this.cells.delete(j * this.size + i)
    return this
  }

  has(x: number, y: number): boolean {
    return this.cells.has(y * this.size + x)
  }

  get count(): number {
    return this.cells.size
  }

  path(): string {
    let out = ''
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size;) {
        if (!this.has(x, y)) {
          x++
          continue
        }
        let w = 1
        while (x + w < this.size && this.has(x + w, y)) w++
        out += `M${x} ${y}h${w}v1h-${w}z`
        x += w
      }
    }
    return out
  }
}

/** Two-tone icon from text rows: '#' = full colour (a), '+' = shade (b), anything else = empty. */
export function art(rows: readonly string[]): { a: string; b: string } {
  const a = new PixelGrid(rows.length)
  const b = new PixelGrid(rows.length)
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') a.p(x, y)
      else if (row[x] === '+') b.p(x, y)
    }
  })
  return { a: a.path(), b: b.path() }
}

/** Picture from text rows and a palette (char → CSS colour; unknown or empty = transparent), as an SVG. */
export function pictureSvg(
  rows: readonly string[],
  palette: Readonly<Record<string, string>>
): string {
  const h = rows.length
  const w = rows[0]?.length ?? 0
  let rects = ''
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = palette[rows[y]?.[x] ?? '']
      if (c) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`
}

/** The same picture as a CSS background value (scaled to the element, sharp edges). */
export function pictureBackground(
  rows: readonly string[],
  palette: Readonly<Record<string, string>>
): string {
  return `url("data:image/svg+xml,${encodeURIComponent(pictureSvg(rows, palette))}") center / 100% 100% no-repeat`
}

/** Deterministic 8×8 noise rows of digits 0..levels-1; `mask` rows keep their non-'.' chars. */
export function noiseRows(levels: number, seed: number, mask?: readonly string[]): string[] {
  const out: string[] = []
  let k = seed * 9301 + 49297
  for (let y = 0; y < 8; y++) {
    let line = ''
    for (let x = 0; x < 8; x++) {
      k = (k * 9301 + 49297) % 233280
      line += String(Math.floor((k / 233280) * levels))
    }
    const m = mask?.[y]
    out.push(m ? [...m].map((ch, i) => (ch === '.' ? line[i] : ch)).join('') : line)
  }
  return out
}
