// Generator actions on an edited `_n` map: each writes through the channel proxies, so it is an
// ordinary undo step and the other channels stay as they are.

import {
  heightFromAlbedo,
  normalsFromHeight,
  occlusionFromHeight,
  type HeightOptions,
  type MapGrid,
  type NormalOptions,
  type OcclusionOptions
} from '../../shared/pbrGenerator'
import { channelDef, normalBlue, toGray, type ChannelDef, type EditedMap } from './channels'
import { combine, pixelCommand, type Command } from './history'
import { replacePixels, type PixelBuffer } from './pixels'

/** Replaces a channel with `byteAt(pixel)` (stored bytes), as one undo step. */
function writeChannel(
  map: EditedMap,
  channel: ChannelDef,
  byteAt: (index: number) => number
): Command | null {
  const layer = map.proxy(channel).active.pixels
  const next = new Uint8Array(layer.data.length)
  for (let i = 0; i < next.length / 4; i++) {
    const gray = toGray(channel, byteAt(i))
    next.set([gray, gray, gray, 255], i * 4)
  }
  return pixelCommand(layer, replacePixels(layer, next))
}

function writeNormals(map: EditedMap, rg: Uint8Array): Command | null {
  const layer = map.proxy(channelDef('normal')).active.pixels
  const next = new Uint8Array(layer.data.length)
  for (let i = 0; i < next.length / 4; i++) {
    const r = rg[i * 2]!
    const g = rg[i * 2 + 1]!
    next.set([r, g, normalBlue(r, g), 255], i * 4)
  }
  return pixelCommand(layer, replacePixels(layer, next))
}

/** The map's current height bytes (call after EditedMap.sync). */
export function heightsOf(map: EditedMap): Uint8Array {
  const data = map.buffer.data
  const out = new Uint8Array(map.width * map.height)
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3]!
  return out
}

export function generateHeight(
  map: EditedMap,
  albedo: PixelBuffer,
  grid: MapGrid,
  options: HeightOptions
): Command | null {
  const heights = heightFromAlbedo(albedo.data, grid, options)
  return writeChannel(map, channelDef('height'), (i) => heights[i]!)
}

/** Normals and/or AO from the map's own height (null options = leave that channel alone). */
export function generateFromHeight(
  map: EditedMap,
  grid: MapGrid,
  normals: NormalOptions | null,
  occlusion: OcclusionOptions | null
): Command | null {
  map.sync()
  const heights = heightsOf(map)
  const commands: Array<Command | null> = []
  if (normals) commands.push(writeNormals(map, normalsFromHeight(heights, grid, normals)))
  if (occlusion) {
    const ao = occlusionFromHeight(heights, grid, occlusion)
    commands.push(writeChannel(map, channelDef('ao'), (i) => ao[i]!))
  }
  return combine(commands)
}

/** True when every normal of the map is flat: nothing hand-made would be lost by regenerating. */
export function normalsAreFlat(map: PixelBuffer): boolean {
  const d = map.data
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i]! - 128) > 1 || Math.abs(d[i + 1]! - 128) > 1) return false
  }
  return true
}
