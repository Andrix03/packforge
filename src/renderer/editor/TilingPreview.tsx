import { useEffect, useRef, useState } from 'react'
import { tr } from '../../shared/i18n'

/** The texture repeated 3×3, to spot seams and repeating patterns while painting. */
export function TilingPreview({
  source,
  revision,
  region
}: {
  source: HTMLCanvasElement
  /** Bumped after each change painted on `source`. */
  revision: number
  /** Rows of the source to tile (one animation frame); default the whole image. */
  region?: { y: number; height: number }
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [showSeams, setShowSeams] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = window.devicePixelRatio || 1
    const size = Math.round(canvas.clientWidth * ratio)
    canvas.width = size
    canvas.height = size
    // Tiles of whole pixels when possible so every texture pixel stays square.
    const sourceY = region?.y ?? 0
    const sourceHeight = region?.height ?? source.height
    const tile = Math.max(1, Math.floor(size / 3 / source.width)) * source.width
    const tileHeight = Math.round((tile * sourceHeight) / source.width)
    const offset = Math.round((size - tile * 3) / 2)
    context.clearRect(0, 0, size, size)
    context.imageSmoothingEnabled = false
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        context.drawImage(
          source,
          0,
          sourceY,
          source.width,
          sourceHeight,
          offset + col * tile,
          offset + row * tileHeight,
          tile,
          tileHeight
        )
      }
    }
    if (showSeams) {
      context.strokeStyle = 'rgba(255, 64, 64, 0.8)'
      context.lineWidth = 1
      context.beginPath()
      for (let i = 1; i < 3; i++) {
        context.moveTo(offset + i * tile + 0.5, offset)
        context.lineTo(offset + i * tile + 0.5, offset + tileHeight * 3)
        context.moveTo(offset, offset + i * tileHeight + 0.5)
        context.lineTo(offset + tile * 3, offset + i * tileHeight + 0.5)
      }
      context.stroke()
    }
  }, [source, revision, showSeams, region?.y, region?.height])

  return (
    <section className="card tiling-preview">
      <div className="row">
        <strong className="small">{tr('Ripetizione 3×3')}</strong>
        <label className="inline-check small" title={tr('Mostra dove si ripete la texture')}>
          <input
            type="checkbox"
            checked={showSeams}
            onChange={(event) => setShowSeams(event.target.checked)}
          />
          {tr('Bordi')}
        </label>
      </div>
      <canvas ref={canvasRef} className="tiling-canvas checker" />
    </section>
  )
}
