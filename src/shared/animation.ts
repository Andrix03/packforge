// Texture animation from `<texture>.png.mcmeta` (the "animation" section).
// Source: https://minecraft.wiki/w/Resource_pack (texture animation
// properties), verified 2026-10-18.

export const TICKS_PER_SECOND = 20

export interface AnimationFrame {
  /** Frame index in the image, row by row from the top-left. */
  index: number
  /** Duration in game ticks. */
  time: number
}

export interface TextureAnimation {
  frameWidth: number
  frameHeight: number
  /** Frames per row in the image. */
  columns: number
  /** Frames available in the image. */
  frameCount: number
  /** Playback order. */
  frames: AnimationFrame[]
  interpolate: boolean
  totalTicks: number
  /** Set when the result relies on an uncertain rule. */
  warning: string | null
}

export type AnimationResult =
  { ok: true; animation: TextureAnimation | null } | { ok: false; error: string }

/**
 * Reads the animation of a texture. `animation: null` when the mcmeta has no
 * animation section. Errors are cases where the game shows a missing texture.
 */
export function parseAnimation(
  mcmeta: unknown,
  imageWidth: number,
  imageHeight: number
): AnimationResult {
  const section = isRecord(mcmeta) ? mcmeta['animation'] : undefined
  if (section === undefined) return { ok: true, animation: null }
  if (!isRecord(section)) return fail('"animation" deve essere un oggetto.')

  const width = optionalPositiveInt(section['width'])
  const height = optionalPositiveInt(section['height'])
  if (width === false || height === false) {
    return fail('"width" e "height" devono essere interi positivi.')
  }
  // Defaults from the wiki: square frames of the smaller image side. With only
  // one of width/height the wiki's rule ("width defaults to the image's height
  // if height is defined", and vice versa) looks suspicious: follow it, but warn.
  const smaller = Math.min(imageWidth, imageHeight)
  const frameWidth = width ?? (height !== undefined ? imageHeight : smaller)
  const frameHeight = height ?? (width !== undefined ? imageWidth : smaller)
  if (imageWidth % frameWidth !== 0 || imageHeight % frameHeight !== 0) {
    return fail(
      `L'immagine (${imageWidth}×${imageHeight}) non è divisibile in frame da ${frameWidth}×${frameHeight}: il gioco mostrerà la texture mancante.`
    )
  }
  const columns = imageWidth / frameWidth
  const frameCount = columns * (imageHeight / frameHeight)

  const frametime = optionalPositiveInt(section['frametime'])
  if (frametime === false) return fail('"frametime" deve essere un intero positivo.')
  const defaultTime = frametime ?? 1

  const interpolate = section['interpolate'] ?? false
  if (typeof interpolate !== 'boolean') return fail('"interpolate" deve essere true o false.')

  let frames: AnimationFrame[]
  if (section['frames'] === undefined) {
    frames = Array.from({ length: frameCount }, (_, index) => ({ index, time: defaultTime }))
  } else {
    if (!Array.isArray(section['frames']) || section['frames'].length === 0) {
      return fail('"frames" deve essere una lista non vuota.')
    }
    frames = []
    for (const entry of section['frames']) {
      const frame = parseFrame(entry, defaultTime)
      if (!frame) return fail('Ogni frame deve essere un indice o {"index", "time"} validi.')
      if (frame.index >= frameCount) {
        return fail(`Il frame ${frame.index} non esiste: l'immagine ne contiene ${frameCount}.`)
      }
      frames.push(frame)
    }
  }

  const totalTicks = frames.reduce((sum, frame) => sum + frame.time, 0)
  const warning =
    (width === undefined) !== (height === undefined)
      ? 'Con solo "width" o solo "height" il comportamento del gioco non è documentato con certezza: specifica entrambi.'
      : null
  return {
    ok: true,
    animation: {
      frameWidth,
      frameHeight,
      columns,
      frameCount,
      frames,
      interpolate,
      totalTicks,
      warning
    }
  }
}

/**
 * Frame shown at `ticks` (looping). `blend` is how far to fade into `next`
 * (always 0 without interpolation).
 */
export function frameAt(
  animation: TextureAnimation,
  ticks: number
): { current: AnimationFrame; next: AnimationFrame; blend: number } {
  const frames = animation.frames
  let t = ((ticks % animation.totalTicks) + animation.totalTicks) % animation.totalTicks
  for (let i = 0; i < frames.length; i++) {
    const current = frames[i] as AnimationFrame
    if (t < current.time) {
      const next = frames[(i + 1) % frames.length] as AnimationFrame
      const blend = animation.interpolate && current.time > 1 ? t / current.time : 0
      return { current, next, blend }
    }
    t -= current.time
  }
  // Floating-point edge: wrap to the start.
  const first = frames[0] as AnimationFrame
  return { current: first, next: frames[1 % frames.length] as AnimationFrame, blend: 0 }
}

/** Pixel rectangle of a frame index (origin top-left). */
export function frameRect(
  animation: TextureAnimation,
  index: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: (index % animation.columns) * animation.frameWidth,
    y: Math.floor(index / animation.columns) * animation.frameHeight,
    width: animation.frameWidth,
    height: animation.frameHeight
  }
}

function parseFrame(entry: unknown, defaultTime: number): AnimationFrame | null {
  if (isNonNegativeInt(entry)) return { index: entry, time: defaultTime }
  if (!isRecord(entry) || !isNonNegativeInt(entry['index'])) return null
  const time = optionalPositiveInt(entry['time'])
  if (time === false) return null
  return { index: entry['index'], time: time ?? defaultTime }
}

/** undefined when absent, false when invalid. */
function optionalPositiveInt(value: unknown): number | undefined | false {
  if (value === undefined) return undefined
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : false
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}
