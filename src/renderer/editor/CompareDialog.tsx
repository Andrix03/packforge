import { useEffect, useMemo, useRef, useState } from 'react'
import { compareTextures, diffImage, onGrid, type Image } from '../../shared/textureCompare'
import { useEscape } from '../useEscape'
import { RangeInput } from '../ui/components'
import { tr } from '../../shared/i18n'

type View = 'side' | 'wipe'

/** My texture (as in the editor, unsaved changes included) against the vanilla one. */
export function CompareDialog({
  name,
  mine,
  vanilla,
  onClose
}: {
  name: string
  mine: Image
  vanilla: Image
  onClose: () => void
}): React.JSX.Element {
  const [view, setView] = useState<View>('side')
  const [split, setSplit] = useState(50)
  useEscape(onClose)
  const comparison = useMemo(() => compareTextures(mine, vanilla), [mine, vanilla])
  const { width, height } = comparison
  const mineGrid = useMemo(() => onGrid(mine, width, height), [mine, width, height])
  const vanillaGrid = useMemo(() => onGrid(vanilla, width, height), [vanilla, width, height])
  const diff = useMemo(() => diffImage(comparison, vanilla), [comparison, vanilla])
  const wipe = useMemo(() => {
    const out = new Uint8ClampedArray(vanillaGrid)
    const cut = Math.round((split / 100) * width)
    for (let y = 0; y < height; y++) {
      const row = y * width * 4
      out.set(mineGrid.subarray(row, row + cut * 4), row)
    }
    return out
  }, [mineGrid, vanillaGrid, split, width, height])

  const share = (n: number): string => `${Math.round((n / comparison.total) * 100)}%`
  const sameShape = mine.width * vanilla.height === mine.height * vanilla.width
  const size =
    mine.width === vanilla.width && mine.height === vanilla.height
      ? tr('stessa dimensione ({0}×{1})', mine.width, mine.height)
      : tr(
          '{0}×{1} contro {2}×{3}{4}',
          mine.width,
          mine.height,
          vanilla.width,
          vanilla.height,
          comparison.scale && comparison.scale !== 1
            ? ` (×${comparison.scale >= 1 ? comparison.scale : `1/${1 / comparison.scale}`})`
            : ''
        )
  const light =
    Math.abs(comparison.lightnessShift) < 1
      ? tr('luminosità simile')
      : comparison.lightnessShift > 0
        ? tr('più chiara (+{0})', comparison.lightnessShift.toFixed(0))
        : tr('più scura ({0})', comparison.lightnessShift.toFixed(0))

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal batch compare"
        role="dialog"
        aria-label={tr('Confronto con vanilla')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{tr('{0}: la mia contro vanilla', name)}</h2>
        <div className="tabs small-tabs" role="radiogroup" aria-label={tr('Vista')}>
          <button
            type="button"
            role="radio"
            aria-checked={view === 'side'}
            className={view === 'side' ? 'tab active' : 'tab'}
            onClick={() => setView('side')}
          >
            {tr('Affiancate')}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={view === 'wipe'}
            className={view === 'wipe' ? 'tab active' : 'tab'}
            onClick={() => setView('wipe')}
          >
            {tr('Tendina')}
          </button>
        </div>
        {view === 'side' ? (
          <div className="compare-row">
            <Figure label={tr('La mia')} width={width} height={height} pixels={mineGrid} />
            <Figure label={tr('Vanilla')} width={width} height={height} pixels={vanillaGrid} />
            <Figure
              label={tr('Differenze')}
              width={width}
              height={height}
              pixels={diff}
              hint={tr('Grigio = uguale, dal rosso al giallo = sempre più diverso')}
            />
          </div>
        ) : (
          <>
            <div className="compare-row">
              <Figure
                label={tr('Tendina: la mia a sinistra, vanilla a destra')}
                width={width}
                height={height}
                pixels={wipe}
                big
              />
            </div>
            <label className="color-slider">
              <span className="small muted">
                {tr('Tendina')} <span className="slider-value">{split}%</span>
              </span>
              <RangeInput
                type="range"
                min={0}
                max={100}
                value={split}
                aria-label={tr('Tendina')}
                onChange={(event) => setSplit(Number(event.target.value))}
              />
            </label>
          </>
        )}
        <ul className="compare-stats small" data-testid="compare-stats">
          <li>
            {tr('Pixel cambiati:')} <strong>{comparison.changed}</strong>{' '}
            {tr('su {0} ({1})', comparison.total, share(comparison.changed))}
            {comparison.changed === 0 && ' — identica a vanilla'}
          </li>
          {comparison.alphaChanged > 0 && (
            <li>{tr('Trasparenza diversa in {0} pixel', comparison.alphaChanged)}</li>
          )}
          <li>
            {tr(
              'Colori: {0} (vanilla {1}), di cui {2} nuovi',
              comparison.colorsMine,
              comparison.colorsVanilla,
              comparison.newColors
            )}
          </li>
          <li>
            {tr(
              'Colore medio: {0}, {1}',
              comparison.meanShift < 2
                ? tr('quasi uguale')
                : tr('spostato di {0}', comparison.meanShift.toFixed(0)),
              light
            )}
          </li>
          <li>{tr('Dimensione: {0}', size)}</li>
          {!sameShape && (
            <li className="muted">
              {tr('Proporzioni diverse (numero di frame diverso?): il confronto è approssimativo.')}
            </li>
          )}
        </ul>
        <p className="small muted">
          {tr(
            'Vanilla è solo un riferimento: qui viene mostrata e misurata, mai copiata nel pack.'
          )}
        </p>
        <div className="row">
          <button type="button" className="primary" onClick={onClose}>
            {tr('Chiudi')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Figure({
  label,
  width,
  height,
  pixels,
  hint,
  big = false
}: {
  label: string
  width: number
  height: number
  pixels: Uint8ClampedArray
  hint?: string
  big?: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = ref.current?.getContext('2d')
    if (!context) return
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0)
  }, [pixels, width, height])
  return (
    <figure className="compare-figure" title={hint}>
      <canvas
        ref={ref}
        className={big ? 'compare-canvas big' : 'compare-canvas'}
        width={width}
        height={height}
        aria-label={label}
      />
      <figcaption className="small muted">{label}</figcaption>
    </figure>
  )
}
