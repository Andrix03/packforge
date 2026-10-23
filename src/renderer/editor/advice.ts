// Soft warnings for Beginner mode, from common texturing advice (Faithful guidelines, pixel-art
// tutorials): small palettes, no darkest-next-to-lightest, contrast close to vanilla.
// They are hints, never errors: the user can ignore them. Thresholds are calibrated on the 1246
// square block textures of the 26.3 jar so that each warning stays quiet on ~90 % of them
// (colors > 16: 12 %, extremes gap >= 0.45 touching: 9 %, spread > 0.55: 8 %).

import { luma, usedColors } from './color'
import type { PixelBuffer } from './pixels'
import { tr } from '../../shared/i18n'

export interface Advice {
  id: 'too-many-colors' | 'extremes-touch' | 'high-contrast'
  /** Italian, shown in the editor. */
  message: string
}

/** Vanilla block textures use 8 colors at the median, 18 at the 90th percentile. */
export const MAX_SUGGESTED_COLORS = 16
/** Brightness spread (10th–90th percentile of pixels) above which a texture looks harsh. */
export const HIGH_CONTRAST = 0.55
/** Minimum brightness gap for the darkest/lightest contact warning. */
export const EXTREMES_GAP = 0.45

export function analyzeTexture(buffer: PixelBuffer): Advice[] {
  const colors = usedColors(buffer)
  const advice: Advice[] = []
  if (colors.length > MAX_SUGGESTED_COLORS) {
    advice.push({
      id: 'too-many-colors',
      message: tr(
        'Usa {0} colori: quasi tutte le texture vanilla ne usano meno di {1}. Prova a riunire le tonalità quasi uguali.',
        colors.length,
        MAX_SUGGESTED_COLORS
      )
    })
  }
  const darkest = colors[0]
  const lightest = colors.at(-1)
  // Neighbors with a small brightness gap are normal noise (vanilla stone does it everywhere).
  if (
    colors.length >= 2 &&
    darkest &&
    lightest &&
    luma(lightest.color) - luma(darkest.color) >= EXTREMES_GAP
  ) {
    const touches = countExtremesTouching(buffer, darkest.color, lightest.color)
    if (touches > 0) {
      advice.push({
        id: 'extremes-touch',
        message: tr(
          'Il colore più scuro tocca il più chiaro in {0} {1}: mettici in mezzo una tonalità di passaggio.',
          touches,
          touches === 1 ? 'punto' : 'punti'
        )
      })
    }
  }
  const spread = brightnessSpread(colors)
  if (spread > HIGH_CONTRAST) {
    advice.push({
      id: 'high-contrast',
      message: tr(
        'Il contrasto è molto alto: rispetto alle texture vanilla può sembrare un materiale diverso. Avvicina le tonalità.'
      )
    })
  }
  return advice
}

/** Pairs of 4-adjacent pixels where one is `dark` and the other `light`. */
function countExtremesTouching(
  buffer: PixelBuffer,
  dark: readonly number[],
  light: readonly number[]
): number {
  const { width, height, data } = buffer
  const is = (index: number, color: readonly number[]): boolean =>
    data[index * 4] === color[0] &&
    data[index * 4 + 1] === color[1] &&
    data[index * 4 + 2] === color[2] &&
    data[index * 4 + 3] === color[3]
  let count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const neighbors = [x + 1 < width ? index + 1 : -1, y + 1 < height ? index + width : -1]
      for (const n of neighbors) {
        if (n === -1) continue
        if ((is(index, dark) && is(n, light)) || (is(index, light) && is(n, dark))) count++
      }
    }
  }
  return count
}

/** Difference between the 90th and 10th percentile brightness, weighted by pixel count. */
function brightnessSpread(colors: ReturnType<typeof usedColors>): number {
  const total = colors.reduce((sum, c) => sum + c.count, 0)
  if (total === 0) return 0
  // Colors are sorted darkest first.
  const percentile = (p: number): number => {
    let seen = 0
    for (const { color, count } of colors) {
      seen += count
      if (seen >= p * total) return luma(color)
    }
    return luma(colors.at(-1)!.color)
  }
  return percentile(0.9) - percentile(0.1)
}
