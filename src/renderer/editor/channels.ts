// Channel painting: each channel of a LabPBR map (`_n`, `_s`) is edited as its own grayscale
// image with the ordinary tools, and written back into that one byte of the map — the other
// channels are never touched. Pure: buffers are plain objects so it runs in tests.
//
// A "proxy" is the editable grayscale image of one channel (gray = the channel's value, opaque).
// Erased (transparent) proxy pixels go back to the channel's neutral value.

import { METALS, type MapKind } from '../../shared/labpbr'
import { f0Byte } from '../../shared/materialPresets'
import { EditorDocument } from './document'
import type { PixelBuffer, Rgba } from './pixels'

export type ChannelId =
  'height' | 'ao' | 'normal' | 'smoothness' | 'reflectance' | 'porosity' | 'emission'

export interface ValuePreset {
  label: string
  value: number
  hint?: string
}

export interface ChannelDef {
  id: ChannelId
  map: MapKind
  /** Byte of the RGBA texel (the normal uses 0 and 1). */
  index: 0 | 1 | 2 | 3
  label: string
  /** "A", "B"…: where it lives in the file. */
  letter: string
  hint: string
  /** Highest gray that can be painted (emission stops at 254: 255 means "off"). */
  max: number
  /** Gray of an erased pixel, and of a new map. */
  neutral: number
  presets: readonly ValuePreset[]
  /** False for the normal: generated from the height, shown in color. */
  paintable: boolean
}

export const CHANNELS: readonly ChannelDef[] = [
  {
    id: 'height',
    map: 'normal',
    index: 3,
    label: 'Altezza',
    letter: 'A',
    hint: 'Bianco = in superficie, nero = 25% del blocco in profondità (rilievo POM). Meglio non scendere sotto 1: alcuni shader pack sbagliano lo 0.',
    max: 255,
    neutral: 255,
    presets: [
      { label: 'Superficie', value: 255 },
      { label: 'Metà', value: 128 },
      { label: 'Fondo', value: 1, hint: 'Il punto più profondo (25% del blocco)' }
    ],
    paintable: true
  },
  {
    id: 'ao',
    map: 'normal',
    index: 2,
    label: 'Occlusione',
    letter: 'B',
    hint: 'Ombra delle fessure (AO): bianco = nessuna ombra, nero = completamente in ombra.',
    max: 255,
    neutral: 255,
    presets: [
      { label: 'Nessuna', value: 255 },
      { label: 'Leggera', value: 200 },
      { label: 'Media', value: 128 },
      { label: 'Forte', value: 64 }
    ],
    paintable: true
  },
  {
    id: 'normal',
    map: 'normal',
    index: 0,
    label: 'Normali',
    letter: 'RG',
    hint: 'La direzione della superficie di ogni pixel (formato DirectX). Si genera dall’altezza: azzurro = piatta.',
    max: 255,
    neutral: 128,
    presets: [],
    paintable: false
  },
  {
    id: 'smoothness',
    map: 'specular',
    index: 0,
    label: 'Levigatezza',
    letter: 'R',
    hint: 'Bianco = liscio e lucido (riflessi netti), nero = ruvido e opaco.',
    max: 255,
    neutral: 0,
    presets: [
      { label: 'Ruvido', value: 0 },
      { label: 'Satinato', value: 100 },
      { label: 'Lucido', value: 190 },
      { label: 'Specchio', value: 255 }
    ],
    paintable: true
  },
  {
    id: 'reflectance',
    map: 'specular',
    index: 1,
    label: 'Riflettanza / metallo',
    letter: 'G',
    hint: '0–229: quanto riflette un materiale non metallico (F0, lineare). 230–237: metalli predefiniti. 255: metallo col colore della texture.',
    max: 255,
    neutral: f0Byte(1.5),
    presets: [
      { label: 'Acqua 2%', value: f0Byte(1.33) },
      { label: 'Pietra, legno, vetro 4%', value: f0Byte(1.5) },
      { label: 'Diamante 17%', value: f0Byte(2.42) },
      ...METALS.map((metal) => ({ label: metal.label, value: metal.value, hint: 'Metallo' })),
      { label: 'Metallo dal colore', value: 255, hint: 'Il colore della texture fa da riflesso' }
    ],
    paintable: true
  },
  {
    id: 'porosity',
    map: 'specular',
    index: 2,
    label: 'Porosità / SSS',
    letter: 'B',
    hint: '0–64: porosità (quanto si scurisce e assorbe la pioggia). 65–255: luce che passa sotto la superficie (foglie, neve, pelle).',
    max: 255,
    neutral: 0,
    presets: [
      { label: 'Nessuna', value: 0, hint: 'Metalli, vetro' },
      { label: 'Legno', value: 12 },
      { label: 'Lana', value: 38 },
      { label: 'Sabbia', value: 64, hint: 'Porosità massima' },
      { label: 'SSS 50%', value: 160 },
      { label: 'SSS 100%', value: 255 }
    ],
    paintable: true
  },
  {
    id: 'emission',
    map: 'specular',
    index: 3,
    label: 'Emissione',
    letter: 'A',
    hint: 'Quanto il pixel brilla di luce propria: nero = spento, 254 = al massimo. Nel file “spento” si salva come 255.',
    max: 254,
    neutral: 0,
    presets: [
      { label: 'Spenta', value: 0 },
      { label: 'Debole', value: 64 },
      { label: 'Media', value: 128 },
      { label: 'Piena', value: 254 }
    ],
    paintable: true
  }
]

export function channelDef(id: ChannelId): ChannelDef {
  return CHANNELS.find((channel) => channel.id === id)!
}

export function channelsOf(map: MapKind): ChannelDef[] {
  return CHANNELS.filter((channel) => channel.map === map)
}

/** Texel of a map nobody has painted yet: flat, unoccluded surface; 4% dielectric, no emission. */
export const NEW_TEXEL: Record<MapKind, Rgba> = {
  normal: [128, 128, 255, 255],
  specular: [0, f0Byte(1.5), 0, 255]
}

export function newMap(kind: MapKind, width: number, height: number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) data.set(NEW_TEXEL[kind], i)
  return { width, height, data }
}

/** Gray shown and painted for a stored byte (emission 255 = "off" shows black). */
export function toGray(channel: ChannelDef, byte: number): number {
  return channel.id === 'emission' && byte === 255 ? 0 : byte
}

/** Stored byte for a painted gray. */
export function fromGray(channel: ChannelDef, gray: number): number {
  return Math.min(channel.max, Math.max(0, Math.round(gray)))
}

/** The editable image of a channel: gray pixels, or the normal in color (Z rebuilt as blue). */
export function buildProxy(channel: ChannelDef, map: PixelBuffer): Uint8ClampedArray {
  const src = map.data
  const out = new Uint8ClampedArray(src.length)
  for (let i = 0; i < src.length; i += 4) {
    if (channel.id === 'normal') {
      out[i] = src[i]!
      out[i + 1] = src[i + 1]!
      out[i + 2] = normalBlue(src[i]!, src[i + 1]!)
    } else {
      const gray = toGray(channel, src[i + channel.index]!)
      out[i] = gray
      out[i + 1] = gray
      out[i + 2] = gray
    }
    out[i + 3] = 255
  }
  return out
}

/** Blue that makes the normal map look like a standard one (Z of the unit normal). */
export function normalBlue(red: number, green: number): number {
  const x = (red / 255) * 2 - 1
  const y = (green / 255) * 2 - 1
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y))
  return Math.round((z * 0.5 + 0.5) * 255)
}

/**
 * Writes a proxy's composite back into its channel of `map`. Pixels whose shown gray already
 * matches are left alone, so an untouched map keeps its bytes exactly (e.g. emission 255).
 */
export function syncProxy(channel: ChannelDef, proxy: PixelBuffer, map: PixelBuffer): void {
  const src = proxy.data
  const dst = map.data
  for (let i = 0; i < src.length; i += 4) {
    const alpha = src[i + 3]!
    if (channel.id === 'normal') {
      if (alpha === 0) continue
      dst[i] = src[i]!
      dst[i + 1] = src[i + 1]!
      continue
    }
    const gray =
      alpha === 255
        ? src[i]!
        : Math.round((src[i]! * alpha + channel.neutral * (255 - alpha)) / 255)
    const at = i + channel.index
    if (toGray(channel, dst[at]!) !== gray) dst[at] = fromGray(channel, gray)
  }
}

/** Gray ramp for the shade and noise tools: five steps around `value`, darkest first. */
export function grayRamp(value: number, step: number, max: number): Rgba[] {
  const values = new Set<number>()
  for (let k = -2; k <= 2; k++) values.add(Math.max(0, Math.min(max, value + k * step)))
  return [...values].sort((a, b) => a - b).map((v) => gray(v))
}

export function gray(value: number): Rgba {
  return [value, value, value, 255]
}

/**
 * A LabPBR map being edited next to its albedo: the bytes, what is on disk, and one persistent
 * proxy document per channel (created on first use, so undo steps keep pointing at its pixels).
 */
export class EditedMap {
  readonly buffer: PixelBuffer
  private saved: Uint8Array
  private readonly proxies = new Map<ChannelId, EditorDocument>()

  constructor(
    readonly kind: MapKind,
    /** The file already exists in the pack. */
    public existed: boolean,
    buffer: PixelBuffer
  ) {
    this.buffer = buffer
    this.saved = new Uint8Array(buffer.data)
  }

  get width(): number {
    return this.buffer.width
  }

  get height(): number {
    return this.buffer.height
  }

  proxy(channel: ChannelDef): EditorDocument {
    let doc = this.proxies.get(channel.id)
    if (!doc) {
      doc = new EditorDocument(this.width, this.height, buildProxy(channel, this.buffer))
      this.proxies.set(channel.id, doc)
    }
    return doc
  }

  /** Recomposites every proxy and writes it into the map. */
  sync(): void {
    for (const [id, doc] of this.proxies) {
      doc.recomposite()
      syncProxy(channelDef(id), doc.composite, this.buffer)
    }
  }

  /** The bytes differ from the file (or, for a new map, from the neutral one). */
  get dirty(): boolean {
    const data = this.buffer.data
    for (let i = 0; i < data.length; i++) if (data[i] !== this.saved[i]) return true
    return false
  }

  /** Worth showing in 3D / saving: on disk already, or painted. */
  get present(): boolean {
    return this.existed || this.dirty
  }

  /** The file holds exactly what PackForge loaded or last saved (null = no file). */
  matchesSaved(bytes: ArrayLike<number> | null): boolean {
    if (bytes === null) return !this.existed
    if (!this.existed || bytes.length !== this.saved.length) return false
    for (let i = 0; i < bytes.length; i++) if (bytes[i] !== this.saved[i]) return false
    return true
  }

  /** `bytes`: what was written (the map may have changed during the save). */
  markSaved(bytes: Uint8Array = new Uint8Array(this.buffer.data)): void {
    this.saved = bytes
    this.existed = true
  }
}
