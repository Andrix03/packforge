import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ctmTile,
  DOWN,
  DOWN_LEFT,
  DOWN_RIGHT,
  LEFT,
  RIGHT,
  serializeProperties,
  UP,
  UP_LEFT,
  UP_RIGHT
} from '../../shared/ctm'
import {
  ctmFolderFor,
  ctmPropertiesFor,
  ctmTiles,
  maxBorder,
  templateProblem,
  type Image
} from '../../shared/ctmTemplate'
import { mapPath, type MapKind } from '../../shared/labpbr'
import type { DecodedPng } from '../../shared/pngCodec'
import type { TextureEntry } from '../../shared/textures'
import { Range } from '../editor/GeneratorPanel'
import { backupBefore } from './backup'
import { errorMessage, loadPng, type FileSource } from './packFetch'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'

/** Wall used by the preview: 1 = block, 0 = gap (shows outer, inner corners and lines). */
const WALL = [
  [1, 1, 1, 1, 0, 1],
  [1, 1, 1, 1, 0, 1],
  [1, 1, 0, 1, 1, 1],
  [1, 1, 1, 1, 1, 0],
  [0, 1, 1, 0, 1, 1]
]

type Phase =
  | { status: 'setup' }
  | { status: 'working'; text: string }
  | { status: 'done'; written: number; errors: string[]; folder: string }

/** Generates the 47 `ctm` tiles of a texture (and its maps) with their `.properties`. */
export function CtmDialog({
  source,
  textures,
  pack,
  onClose
}: {
  source: TextureEntry
  /** Pack textures that can be the borderless center. */
  textures: readonly TextureEntry[]
  pack: FileSource
  onClose: () => void
}): React.JSX.Element {
  const [image, setImage] = useState<DecodedPng | { error: string } | null>(null)
  const [centerPath, setCenterPath] = useState<string>('')
  const [center, setCenter] = useState<DecodedPng | null>(null)
  const [border, setBorder] = useState(1)
  const [withMaps, setWithMaps] = useState(source.normal !== null || source.specular !== null)
  const [phase, setPhase] = useState<Phase>({ status: 'setup' })
  useEscape(onClose, phase.status !== 'working')

  useEffect(() => {
    let cancelled = false
    loadPng(pack, source.albedo).then(
      (png) => !cancelled && setImage(png),
      (error: unknown) => !cancelled && setImage({ error: errorMessage(error) })
    )
    return () => {
      cancelled = true
    }
  }, [pack, source.albedo])

  useEffect(() => {
    if (!centerPath) return
    let cancelled = false
    loadPng(pack, centerPath).then(
      (png) => !cancelled && setCenter(png),
      () => !cancelled && setCenter(null)
    )
    return () => {
      cancelled = true
    }
  }, [pack, centerPath])

  const loaded = image && !('error' in image) ? image : null
  const problem = loaded ? templateProblem(loaded) : null
  const usedCenter = centerPath ? center : null
  const tiles = useMemo(
    () => (loaded && !problem ? ctmTiles(loaded, usedCenter, { border }) : []),
    [loaded, problem, usedCenter, border]
  )
  const folder = ctmFolderFor(source.albedo)
  const exists = [...pack.files].some((path) => path.startsWith(`${folder}/`))
  const centers = textures.filter((t) => t.albedo !== source.albedo)

  const create = useSingleFlight(async (): Promise<void> => {
    if (!loaded || problem) return
    if (
      exists &&
      !window.confirm(
        `La cartella ${folder} esiste già: sovrascrivere i suoi tile? Prima viene fatto un backup (🕘 Backup per tornare indietro).`
      )
    ) {
      return
    }
    const kinds = withMaps
      ? (['normal', 'specular'] as const).filter((kind) =>
          kind === 'normal' ? source.normal !== null : source.specular !== null
        )
      : []
    const touched = [
      ...tiles.flatMap((_, index) => {
        const tile = `${folder}/${index}.png`
        return [tile, ...kinds.map((kind) => mapPath(tile, kind))]
      }),
      `${folder}/${folder.slice(folder.lastIndexOf('/') + 1)}.properties`
    ]
    if (!(await backupBefore(`Texture connesse di ${source.name}`, touched))) return
    const errors: string[] = []
    let written = 0
    const save = async (path: string, img: Image, data: Uint8ClampedArray): Promise<void> => {
      const saved = await window.api.invoke(
        'texture:save',
        path,
        img.width,
        img.height,
        new Uint8Array(data)
      )
      if (saved.ok) written++
      else errors.push(`${path.split('/').pop()}: ${saved.error}`)
    }
    for (const [index, tile] of tiles.entries()) {
      setPhase({ status: 'working', text: `Scrivo i tile… ${index + 1}/47` })
      await save(`${folder}/${index}.png`, loaded, tile)
    }
    if (withMaps) {
      // The maps get the same frame logic, so relief and material follow the connections.
      for (const kind of ['normal', 'specular'] as const satisfies readonly MapKind[]) {
        const path = kind === 'normal' ? source.normal : source.specular
        if (!path) continue
        try {
          const map = await loadPng(pack, path)
          const centerMap =
            usedCenter && centerPath && pack.files.has(mapPath(centerPath, kind))
              ? await loadPng(pack, mapPath(centerPath, kind)).catch(() => null)
              : null
          const mapTiles = ctmTiles(map, centerMap, {
            border: Math.round((border * map.width) / loaded.width)
          })
          for (const [index, tile] of mapTiles.entries()) {
            setPhase({
              status: 'working',
              text: `Scrivo le mappe ${kind === 'normal' ? '_n' : '_s'}… ${index + 1}/47`
            })
            await save(mapPath(`${folder}/${index}.png`, kind), map, tile)
          }
        } catch (error) {
          errors.push(`${path.split('/').pop()}: ${errorMessage(error)}`)
        }
      }
    }
    const { entries } = ctmPropertiesFor(source.albedo)
    const properties = await window.api.invoke(
      'ctm:saveProperties',
      `${folder}/${folder.slice(folder.lastIndexOf('/') + 1)}.properties`,
      serializeProperties(entries, `Texture connesse di ${source.albedo}, create da PackForge`)
    )
    if (!properties.ok) errors.push(properties.error)
    setPhase({ status: 'done', written, errors, folder })
  })

  if (phase.status !== 'setup') {
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="card modal batch" role="dialog" aria-label="Texture connesse">
          <h2>Texture connesse</h2>
          {phase.status === 'working' ? (
            <p className="small">{phase.text}</p>
          ) : (
            <>
              <p className="small" data-testid="ctm-result">
                ✓ {phase.written} tile scritti in {phase.folder}
                {phase.errors.length > 0 && ` · ✗ ${phase.errors.length} errori`}
              </p>
              {phase.errors.map((error) => (
                <p key={error} className="field-error small">
                  {error}
                </p>
              ))}
              <p className="small muted">
                In gioco servono Continuity (Fabric, anche con Iris) oppure OptiFine.
              </p>
              <div className="row">
                <button type="button" className="primary" onClick={onClose}>
                  Chiudi
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal batch"
        role="dialog"
        aria-label="Texture connesse"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Texture connesse di {source.name}</h2>
        <p className="muted small">
          Crea i 47 tile del metodo «ctm»: blocchi uguali vicini si uniscono e il bordo resta solo
          sui lati liberi (vetro, mattoni, pannelli). Funziona con Continuity (Fabric) e OptiFine.
        </p>
        {image && 'error' in image && <p className="field-error small">{image.error}</p>}
        {problem && <p className="field-error small">{problem}</p>}
        {loaded && !problem && (
          <>
            <Range
              label="Spessore del bordo"
              value={border}
              unit=" px"
              min={1}
              max={maxBorder(loaded.width)}
              title="Quanti pixel dal bordo formano la cornice che sparisce dove i blocchi si toccano"
              onChange={setBorder}
            />
            <label
              className="small select-field"
              title="Facoltativa: la texture senza cornice, usata dove i blocchi si uniscono"
            >
              Interno{' '}
              <select
                aria-label="Interno"
                value={centerPath}
                onChange={(event) => setCenterPath(event.target.value)}
              >
                <option value="">l’interno della texture stessa</option>
                {centers.map((t) => (
                  <option key={t.albedo} value={t.albedo}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="ctm-previews">
              <figure className="compare-figure">
                <Canvas className="ctm-wall" {...wallPreview(loaded, tiles)} />
                <figcaption className="small muted">Anteprima a muro</figcaption>
              </figure>
              <figure className="compare-figure">
                <Canvas className="ctm-sheet" {...sheetPreview(loaded, tiles)} />
                <figcaption className="small muted">
                  I 47 tile (come il template di OptiFine)
                </figcaption>
              </figure>
            </div>
            {(source.normal || source.specular) && (
              <label className="inline-check small">
                <input
                  type="checkbox"
                  checked={withMaps}
                  onChange={(event) => setWithMaps(event.target.checked)}
                />
                Crea anche i tile di _n e _s (rilievo e materiale seguono le connessioni)
              </label>
            )}
            <p className="small muted">
              Cartella: {folder}/{exists && ' · esiste già'}
            </p>
          </>
        )}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={!loaded || problem !== null}
            onClick={() => create()}
          >
            Crea i 47 tile
          </button>
          <button type="button" onClick={onClose}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}

/** The tiles in the template's 12×4 grid (tile i at column i % 12, row ⌊i / 12⌋). */
function sheetPreview(image: Image, tiles: readonly Uint8ClampedArray[]): CanvasData {
  const size = image.width
  const width = size * 12
  const height = size * 4
  const data = new Uint8ClampedArray(width * height * 4)
  tiles.forEach((tile, index) =>
    blit(data, width, tile, size, (index % 12) * size, Math.floor(index / 12) * size)
  )
  return { width, height, data }
}

/** The tiles on a small wall, each picking its tile from its neighbours (like the game). */
function wallPreview(image: Image, tiles: readonly Uint8ClampedArray[]): CanvasData {
  const size = image.width
  const rows = WALL.length
  const cols = WALL[0]!.length
  const width = cols * size
  const height = rows * size
  const data = new Uint8ClampedArray(width * height * 4)
  const filled = (r: number, c: number): boolean => WALL[r]?.[c] === 1
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!filled(r, c)) continue
      let mask = 0
      if (filled(r, c - 1)) mask |= LEFT
      if (filled(r, c + 1)) mask |= RIGHT
      if (filled(r - 1, c)) mask |= UP
      if (filled(r + 1, c)) mask |= DOWN
      if (filled(r - 1, c - 1)) mask |= UP_LEFT
      if (filled(r - 1, c + 1)) mask |= UP_RIGHT
      if (filled(r + 1, c - 1)) mask |= DOWN_LEFT
      if (filled(r + 1, c + 1)) mask |= DOWN_RIGHT
      const tile = tiles[ctmTile(mask)]
      if (tile) blit(data, width, tile, size, c * size, r * size)
    }
  }
  return { width, height, data }
}

function blit(
  target: Uint8ClampedArray,
  targetWidth: number,
  tile: Uint8ClampedArray,
  size: number,
  x0: number,
  y0: number
): void {
  for (let y = 0; y < size; y++) {
    target.set(tile.subarray(y * size * 4, (y + 1) * size * 4), ((y0 + y) * targetWidth + x0) * 4)
  }
}

interface CanvasData {
  width: number
  height: number
  data: Uint8ClampedArray
}

function Canvas({
  width,
  height,
  data,
  className
}: CanvasData & { className: string }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = ref.current?.getContext('2d')
    if (!context) return
    context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0)
  }, [data, width, height])
  return <canvas ref={ref} className={className} width={width} height={height} />
}
