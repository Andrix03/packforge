import {
  colormapPixel,
  hexToRgb,
  tintSourceForBlock,
  type Biome,
  type Colormap,
  type Rgb
} from '../../shared/biomeTint'
import { resolveAssetUrl, type AssetSources } from './modelSource'

const COLORMAPS: readonly Colormap[] = ['grass', 'foliage', 'dry_foliage']

export type ColormapPixels = Partial<Record<Colormap, ImageData>>

/** Loads the colormap images (pack first, then vanilla). Missing ones are skipped. */
export async function loadColormaps(sources: AssetSources): Promise<ColormapPixels> {
  const result: ColormapPixels = {}
  await Promise.all(
    COLORMAPS.map(async (name) => {
      const url = resolveAssetUrl(sources, `assets/minecraft/textures/colormap/${name}.png`)
      if (!url) return
      const pixels = await readPixels(url)
      if (pixels) result[name] = pixels
    })
  )
  return result
}

/**
 * Tint function for a block in a biome: null when PackForge does not
 * simulate that block's tint (it is then drawn untinted).
 */
export function tintFor(
  block: string,
  biome: Biome,
  colormaps: ColormapPixels
): (tintIndex: number) => Rgb | null {
  const source = tintSourceForBlock(block)
  return () => {
    if (!source) return null
    if (source.kind === 'fixed') return hexToRgb(source.color)
    const override = biome.overrides?.[source.colormap]
    if (override) return hexToRgb(override)
    const pixels = colormaps[source.colormap]
    if (!pixels) return null
    const { x, y } = colormapPixel(biome.temperature, biome.downfall)
    // Colormaps are 256×256 in vanilla; scale in case a pack ships another size.
    const px = Math.min(pixels.width - 1, Math.floor((x / 256) * pixels.width))
    const py = Math.min(pixels.height - 1, Math.floor((y / 256) * pixels.height))
    const i = (py * pixels.width + px) * 4
    return [pixels.data[i]! / 255, pixels.data[i + 1]! / 255, pixels.data[i + 2]! / 255]
  }
}

function readPixels(url: string): Promise<ImageData | null> {
  return new Promise((resolve) => {
    const image = new Image()
    // pack:// sends CORS headers, so the canvas is not tainted.
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return resolve(null)
      context.drawImage(image, 0, 0)
      resolve(context.getImageData(0, 0, canvas.width, canvas.height))
    }
    image.onerror = () => resolve(null)
    image.src = url
  })
}
