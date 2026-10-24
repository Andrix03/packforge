// The editor's preview for the biome colormaps (`textures/colormap/grass.png`, foliage,
// dry_foliage) in place of the 3D block: the map with each biome's point (temperature ×
// downfall, as the game samples it) and the colour each biome gets, live while painting.
// Biomes with a fixed colour (badlands, cherry grove) ignore the map: shown as such.
import { useEffect, useRef } from 'react'
import { BIOMES, colormapPixel, type Colormap } from '../../shared/biomeTint'
import { tr } from '../../shared/i18n'

const LABELS: Record<Colormap | 'polytone', () => string> = {
  polytone: () => tr('Polytone'),
  grass: () => tr('Erba'),
  foliage: () => tr('Foglie'),
  dry_foliage: () => tr('Foglie secche')
}

export function ColormapPreview({
  colormap,
  canvas,
  revision
}: {
  /** A vanilla colormap, or a Polytone one (sampled like grass, no fixed biome colours). */
  colormap: Colormap | 'polytone'
  canvas: HTMLCanvasElement | null
  revision: number
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const swatches = useRef<Array<HTMLSpanElement | null>>([])
  useEffect(() => {
    const view = ref.current
    const context = view?.getContext('2d')
    if (!view || !context || !canvas || canvas.width === 0) return
    view.width = 256
    view.height = 256
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, 256, 256)
    context.drawImage(canvas, 0, 0, 256, 256)
    // Read the painted map once: each biome's pixel (the map is opaque, so the read is exact).
    const source = canvas.getContext('2d')
    const data = source?.getImageData(0, 0, canvas.width, canvas.height).data
    BIOMES.forEach((biome, i) => {
      const { x, y } = colormapPixel(biome.temperature, biome.downfall)
      const fixed = colormap === 'polytone' ? undefined : biome.overrides?.[colormap]
      let color = fixed ?? '#000000'
      if (!fixed && data) {
        const px = Math.min(canvas.width - 1, Math.floor((x / 256) * canvas.width))
        const py = Math.min(canvas.height - 1, Math.floor((y / 256) * canvas.height))
        const at = (py * canvas.width + px) * 4
        color = `rgb(${data[at]}, ${data[at + 1]}, ${data[at + 2]})`
      }
      const swatch = swatches.current[i]
      if (swatch) swatch.style.background = color
      if (fixed) return
      // The biome's point on the map.
      context.strokeStyle = '#000000'
      context.lineWidth = 3
      context.strokeRect(x - 4, y - 4, 9, 9)
      context.strokeStyle = '#ffffff'
      context.lineWidth = 1
      context.strokeRect(x - 4, y - 4, 9, 9)
    })
  }, [canvas, revision, colormap])

  return (
    <section className="colormap-preview card" aria-label={tr('Anteprima colormap')}>
      <span className="lbl">{tr('Colori dei biomi: {0}', LABELS[colormap]())}</span>
      <p className="muted small">
        {tr(
          'Il gioco prende il colore di ogni bioma da un punto della mappa: più a sinistra fa caldo, più in alto piove. La metà in basso a destra non si usa.'
        )}
      </p>
      <canvas ref={ref} className="colormap-view sunken" aria-hidden="true" />
      <ul className="colormap-biomes" data-testid="colormap-biomes">
        {BIOMES.map((biome, i) => (
          <li key={biome.id}>
            <span
              className="colormap-swatch"
              ref={(element) => {
                swatches.current[i] = element
              }}
            />
            <span className="small">
              {biome.label}
              {colormap !== 'polytone' && biome.overrides?.[colormap] && (
                <span className="muted"> {tr('(colore fisso, non dalla mappa)')}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
