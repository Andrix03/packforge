import { useEffect, useMemo, useRef, useState } from 'react'
import { compareTextures, diffImage, onGrid, type Image } from '../../shared/textureCompare'
import { useEscape } from '../useEscape'

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
      ? `stessa dimensione (${mine.width}×${mine.height})`
      : `${mine.width}×${mine.height} contro ${vanilla.width}×${vanilla.height}${comparison.scale && comparison.scale !== 1 ? ` (×${comparison.scale >= 1 ? comparison.scale : `1/${1 / comparison.scale}`})` : ''}`
  const light =
    Math.abs(comparison.lightnessShift) < 1
      ? 'luminosità simile'
      : comparison.lightnessShift > 0
        ? `più chiara (+${comparison.lightnessShift.toFixed(0)})`
        : `più scura (${comparison.lightnessShift.toFixed(0)})`

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal batch compare"
        role="dialog"
        aria-label="Confronto con vanilla"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{name}: la mia contro vanilla</h2>
        <div className="tabs small-tabs" role="radiogroup" aria-label="Vista">
          <button
            type="button"
            role="radio"
            aria-checked={view === 'side'}
            className={view === 'side' ? 'tab active' : 'tab'}
            onClick={() => setView('side')}
          >
            Affiancate
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={view === 'wipe'}
            className={view === 'wipe' ? 'tab active' : 'tab'}
            onClick={() => setView('wipe')}
          >
            Tendina
          </button>
        </div>
        {view === 'side' ? (
          <div className="compare-row">
            <Figure label="La mia" width={width} height={height} pixels={mineGrid} />
            <Figure label="Vanilla" width={width} height={height} pixels={vanillaGrid} />
            <Figure
              label="Differenze"
              width={width}
              height={height}
              pixels={diff}
              hint="Grigio = uguale, dal rosso al giallo = sempre più diverso"
            />
          </div>
        ) : (
          <>
            <div className="compare-row">
              <Figure
                label="← la mia · vanilla →"
                width={width}
                height={height}
                pixels={wipe}
                big
              />
            </div>
            <label className="color-slider">
              <span className="small muted">
                Tendina <span className="slider-value">{split}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={split}
                aria-label="Tendina"
                onChange={(event) => setSplit(Number(event.target.value))}
              />
            </label>
          </>
        )}
        <ul className="compare-stats small" data-testid="compare-stats">
          <li>
            Pixel cambiati: <strong>{comparison.changed}</strong> su {comparison.total} (
            {share(comparison.changed)}){comparison.changed === 0 && ' — identica a vanilla'}
          </li>
          {comparison.alphaChanged > 0 && (
            <li>Trasparenza diversa in {comparison.alphaChanged} pixel</li>
          )}
          <li>
            Colori: {comparison.colorsMine} (vanilla {comparison.colorsVanilla}), di cui{' '}
            {comparison.newColors} nuovi
          </li>
          <li>
            Colore medio:{' '}
            {comparison.meanShift < 2
              ? 'quasi uguale'
              : `spostato di ${comparison.meanShift.toFixed(0)}`}
            , {light}
          </li>
          <li>Dimensione: {size}</li>
          {!sameShape && (
            <li className="muted">
              Proporzioni diverse (numero di frame diverso?): il confronto è approssimativo.
            </li>
          )}
        </ul>
        <p className="small muted">
          Vanilla è solo un riferimento: qui viene mostrata e misurata, mai copiata nel pack.
        </p>
        <div className="row">
          <button type="button" className="primary" onClick={onClose}>
            Chiudi
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
