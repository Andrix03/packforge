// GUI sprites (`textures/gui/sprites/…`, 1.20.2+): the `gui.scaling` section of their .png.mcmeta
// and how the game lays a sprite out at a given size. Checked on the 26.3 client
// (GuiSpriteScaling codecs and GuiGraphicsExtractor.blitNineSlicedSprite, read with javap). Pure.
//
// Sizes are in GUI units: the sprite's `width`/`height` are its logical size (a 2× sprite has
// twice the pixels); sources below are in those units, so a drawer multiplies by the scale.
import { tr } from './i18n'

export interface Border {
  left: number
  top: number
  right: number
  bottom: number
}

export type GuiScaling =
  | { type: 'stretch' }
  | { type: 'tile'; width: number; height: number }
  | { type: 'nine_slice'; width: number; height: number; border: Border; stretchInner: boolean }

export type ScalingResult = { ok: true; scaling: GuiScaling } | { ok: false; error: string }

/** Reads `gui.scaling` from a sprite's .png.mcmeta (no section = stretched). */
export function parseGuiScaling(mcmeta: unknown): ScalingResult {
  const gui = isRecord(mcmeta) ? mcmeta['gui'] : undefined
  const scaling = isRecord(gui) ? gui['scaling'] : undefined
  if (scaling === undefined) return { ok: true, scaling: { type: 'stretch' } }
  if (!isRecord(scaling)) return fail(tr('"scaling" deve essere un oggetto.'))
  const type = scaling['type']
  if (type === 'stretch') return { ok: true, scaling: { type } }
  if (type !== 'tile' && type !== 'nine_slice') {
    return fail(tr('"type" deve essere "stretch", "tile" o "nine_slice".'))
  }
  const { width, height } = scaling
  if (!isPositiveInt(width) || !isPositiveInt(height)) {
    return fail(tr('"width" e "height" devono essere interi positivi.'))
  }
  if (type === 'tile') return { ok: true, scaling: { type, width, height } }

  const border = readBorder(scaling['border'])
  if (!border) {
    return fail(tr('"border" deve essere un intero o {left, top, right, bottom}.'))
  }
  const stretchInner = scaling['stretch_inner'] ?? false
  if (typeof stretchInner !== 'boolean')
    return fail(tr('"stretch_inner" deve essere true o false.'))
  // The game refuses a nine-slice without a centre (the sprite then fails to load).
  if (border.left + border.right >= width) {
    return fail(
      tr(
        'Bordi sinistro + destro ({0} + {1}) arrivano alla larghezza {2}: nessuna parte centrale.',
        border.left,
        border.right,
        width
      )
    )
  }
  if (border.top + border.bottom >= height) {
    return fail(
      tr(
        'Bordi alto + basso ({0} + {1}) arrivano all’altezza {2}: nessuna parte centrale.',
        border.top,
        border.bottom,
        height
      )
    )
  }
  return { ok: true, scaling: { type, width, height, border, stretchInner } }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** One draw call: a part of the sprite (`source`) put into `target`, stretched or repeated. */
export interface SpritePiece {
  source: Rect
  target: Rect
  fill: 'stretch' | 'tile'
}

/**
 * How the game draws the sprite `width`×`height` GUI units large. `spriteWidth`/`spriteHeight`:
 * the logical size of a stretched sprite (its pixels / scale); tile and nine-slice bring theirs.
 */
export function layoutSprite(
  scaling: GuiScaling,
  width: number,
  height: number,
  spriteWidth = width,
  spriteHeight = height
): SpritePiece[] {
  const whole = (w: number, h: number): Rect => ({ x: 0, y: 0, width: w, height: h })
  if (scaling.type === 'stretch') {
    return [
      { source: whole(spriteWidth, spriteHeight), target: whole(width, height), fill: 'stretch' }
    ]
  }
  if (scaling.type === 'tile') {
    return [
      { source: whole(scaling.width, scaling.height), target: whole(width, height), fill: 'tile' }
    ]
  }
  const { border, stretchInner } = scaling
  const sw = scaling.width
  const sh = scaling.height
  const inner = stretchInner ? 'stretch' : 'tile'
  // Borders never take more than half the drawn size (Java int division).
  const left = Math.min(border.left, Math.trunc(width / 2))
  const right = Math.min(border.right, Math.trunc(width / 2))
  const top = Math.min(border.top, Math.trunc(height / 2))
  const bottom = Math.min(border.bottom, Math.trunc(height / 2))
  if (width === sw && height === sh) {
    return [{ source: whole(sw, sh), target: whole(width, height), fill: 'stretch' }]
  }
  const pieces: SpritePiece[] = []
  const piece = (source: Rect, target: Rect, fill: 'stretch' | 'tile'): void => {
    if (target.width > 0 && target.height > 0) pieces.push({ source, target, fill })
  }
  const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, width: w, height: h })
  // Columns and rows: [source start, source size, target start, target size, corner?]
  const columns: Array<[number, number, number, number, boolean]> =
    width === sw
      ? [[0, sw, 0, width, true]]
      : [
          [0, left, 0, left, true],
          [left, sw - left - right, left, width - left - right, false],
          [sw - right, right, width - right, right, true]
        ]
  const rows: Array<[number, number, number, number, boolean]> =
    height === sh
      ? [[0, sh, 0, height, true]]
      : [
          [0, top, 0, top, true],
          [top, sh - top - bottom, top, height - top - bottom, false],
          [sh - bottom, bottom, height - bottom, bottom, true]
        ]
  for (const [sy, sHeight, ty, tHeight, rowCorner] of rows) {
    for (const [sx, sWidth, tx, tWidth, columnCorner] of columns) {
      // Corners (and the full-size side of a 3-slice) are drawn as they are; the rest repeats.
      piece(
        rect(sx, sy, sWidth, sHeight),
        rect(tx, ty, tWidth, tHeight),
        rowCorner && columnCorner ? 'stretch' : inner
      )
    }
  }
  return pieces
}

/** What kind of GUI texture a pack path is, or null for anything else. */
export type GuiTextureKind = 'sprite' | 'title' | 'gui'

export function guiTextureKind(path: string): GuiTextureKind | null {
  const m = /^assets\/[^/]+\/textures\/gui\/(.+)\.png$/.exec(path)
  if (!m || !m[1]) return null
  if (m[1].startsWith('sprites/')) return 'sprite'
  if (m[1].startsWith('title/')) return 'title'
  return 'gui'
}

/**
 * The sprite's area for grouping: `textures/gui/sprites/container/furnace/…` → "container";
 * other GUI textures by their folder ("title", "container"…), "gui" at the root.
 */
export function guiArea(path: string): string {
  const m = /textures\/gui\/(?:sprites\/)?([^/]+)\//.exec(path)
  return m?.[1] ?? 'gui'
}

/**
 * The .png.mcmeta text with `gui.scaling` set to `scaling` (null removes the gui section), every
 * other section kept. Null when nothing is left: the file can be deleted. A nine-slice border with
 * four equal sides is written as one number, like the vanilla files.
 */
export function withGuiScaling(original: unknown, scaling: GuiScaling | null): string | null {
  const root: Record<string, unknown> = isRecord(original) ? { ...original } : {}
  const gui: Record<string, unknown> = isRecord(root['gui']) ? { ...root['gui'] } : {}
  delete gui['scaling']
  if (scaling) gui['scaling'] = scalingJson(scaling)
  if (Object.keys(gui).length > 0) root['gui'] = gui
  else delete root['gui']
  return Object.keys(root).length > 0 ? `${JSON.stringify(root, null, 2)}\n` : null
}

function scalingJson(scaling: GuiScaling): Record<string, unknown> {
  if (scaling.type === 'stretch') return { type: 'stretch' }
  if (scaling.type === 'tile') return { type: 'tile', width: scaling.width, height: scaling.height }
  const { left, top, right, bottom } = scaling.border
  const border = left === top && top === right && right === bottom ? left : scaling.border
  return {
    type: 'nine_slice',
    width: scaling.width,
    height: scaling.height,
    border,
    ...(scaling.stretchInner ? { stretch_inner: true } : {})
  }
}

/**
 * A sprite's logical size in GUI units: from its scaling when it has one, otherwise the vanilla
 * sprite's size (a higher-resolution pack draws the same GUI units with more pixels), otherwise
 * its own pixels.
 */
export function logicalSize(
  scaling: GuiScaling,
  pixels: { width: number; height: number },
  vanilla: { width: number; height: number } | null
): { width: number; height: number } {
  if (scaling.type !== 'stretch') return { width: scaling.width, height: scaling.height }
  return vanilla ?? pixels
}

function readBorder(value: unknown): Border | null {
  if (isNonNegativeInt(value)) return { left: value, top: value, right: value, bottom: value }
  if (!isRecord(value)) return null
  const { left, top, right, bottom } = value
  return isNonNegativeInt(left) &&
    isNonNegativeInt(top) &&
    isNonNegativeInt(right) &&
    isNonNegativeInt(bottom)
    ? { left, top, right, bottom }
    : null
}

function fail(error: string): ScalingResult {
  return { ok: false, error }
}

function isPositiveInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0
}

function isNonNegativeInt(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
