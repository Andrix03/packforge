import { useEffect, useState } from 'react'
import { decodePng } from '../../shared/pngCodec'
import { resolveAssetUrl, type AssetSources } from '../preview/modelSource'
import type { StageContext } from './stageContext'

type Canvases = { [K in keyof StageContext]: HTMLCanvasElement | null }

const NONE: Canvases = { above: null, below: null, previous: null }

/** A texture of the pack (or the game, as a reference) drawn into a canvas; null if unreadable. */
async function loadCanvas(
  sources: AssetSources,
  path: string | null
): Promise<HTMLCanvasElement | null> {
  const url = path ? resolveAssetUrl(sources, path) : null
  if (!url) return null
  try {
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) return null
    const decoded = decodePng(new Uint8Array(await response.arrayBuffer()))
    if (!decoded.ok) return null
    const { width, height, data } = decoded.image
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas
      .getContext('2d')
      ?.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0)
    return canvas
  } catch {
    return null
  }
}

/** The stage neighbours as canvases for the editor (none while loading or when absent). */
export function useStageCanvases(context: StageContext, sources: AssetSources): Canvases {
  const key = [context.above, context.below, context.previous]
    .map((path) => (path ? (resolveAssetUrl(sources, path) ?? '') : ''))
    .join('|')
  const [loaded, setLoaded] = useState<{ key: string; canvases: Canvases } | null>(null)
  useEffect(() => {
    if (key === '||') return
    let current = true
    void Promise.all([
      loadCanvas(sources, context.above),
      loadCanvas(sources, context.below),
      loadCanvas(sources, context.previous)
    ]).then(([above, below, previous]) => {
      if (current) setLoaded({ key, canvases: { above, below, previous } })
    })
    return () => {
      current = false
    }
    // The key stands for the three paths and their file versions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return loaded?.key === key ? loaded.canvases : NONE
}
