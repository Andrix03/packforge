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
  lineTileIndex,
  methodTiles,
  type CtmMethod,
  maxBorder,
  templateProblem,
  type Image
} from '../../shared/ctmTemplate'
import { mapPath, type MapKind } from '../../shared/labpbr'
import type { DecodedPng } from '../../shared/pngCodec'
import type { TextureEntry } from '../../shared/textures'
import { Range } from '../editor/GeneratorPanel'
import { Picture, Switch } from '../ui/components'
import { CTM_PICTURES } from '../ui/pictures'
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

/**
 * Generates the 47 `ctm` tiles of a texture (and its maps) with their `.properties`, in four steps
 * (canvas: Texture connesse): the texture, the method, the wall before / after, apply.
 */
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
  const [step, setStep] = useState(0)
  const [method, setMethod] = useState<CtmMethod>('ctm')
  const [showAfter, setShowAfter] = useState(true)
  const [both, setBoth] = useState(false)
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
    () => (loaded && !problem ? methodTiles(loaded, usedCenter, { border }, method) : []),
    [loaded, problem, usedCenter, border, method]
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
      setPhase({ status: 'working', text: `Scrivo i tile… ${index + 1}/${tiles.length}` })
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
          const mapTiles = methodTiles(
            map,
            centerMap,
            { border: Math.round((border * map.width) / loaded.width) },
            method
          )
          for (const [index, tile] of mapTiles.entries()) {
            setPhase({
              status: 'working',
              text: `Scrivo le mappe ${kind === 'normal' ? '_n' : '_s'}… ${index + 1}/${mapTiles.length}`
            })
            await save(mapPath(`${folder}/${index}.png`, kind), map, tile)
          }
        } catch (error) {
          errors.push(`${path.split('/').pop()}: ${errorMessage(error)}`)
        }
      }
    }
    const { entries } = ctmPropertiesFor(source.albedo, method)
    const properties = await window.api.invoke(
      'ctm:saveProperties',
      `${folder}/${folder.slice(folder.lastIndexOf('/') + 1)}.properties`,
      serializeProperties(entries, `Texture connesse di ${source.albedo}, create da PackForge`)
    )
    if (!properties.ok) errors.push(properties.error)
    setPhase({ status: 'done', written, errors, folder })
  })

  const busy = phase.status === 'working'
  const mapKinds = (['normal', 'specular'] as const).filter((kind) =>
    kind === 'normal' ? source.normal !== null : source.specular !== null
  )
  const tileCount = method === 'ctm' ? 47 : 4
  /** The method in use (the cards' loop variable is also called method). */
  const chosen = method
  const fileCount = tileCount * (1 + (withMaps ? mapKinds.length : 0)) + 1
  const ready = loaded !== null && problem === null
  const create47 = (
    <button
      type="button"
      className={step === 2 ? 'primary' : undefined}
      disabled={!ready || busy || phase.status === 'done'}
      onClick={() => {
        setStep(3)
        create()
      }}
    >
      Crea i {tileCount} tile
    </button>
  )

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="card modal batch wizard"
        role="dialog"
        aria-label="Texture connesse"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="wizard-head">
          <h2>Texture connesse di {source.name}</h2>
          <ol className="wizard-steps" aria-label="Passi">
            {CTM_STEPS.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  className={index === step ? 'ore-on' : 'ore'}
                  aria-current={index === step ? 'step' : undefined}
                  disabled={
                    busy ||
                    (index === 3 && phase.status === 'setup') ||
                    (index < 3 && phase.status !== 'setup')
                  }
                  onClick={() => setStep(index)}
                >
                  {index < step ? '✓ ' : ''}
                  {index + 1} · {label}
                </button>
              </li>
            ))}
          </ol>
          <span className="muted small">{loaded ? `${loaded.width}×${loaded.height}` : ''}</span>
        </header>
        {image && 'error' in image && <p className="field-error small">{image.error}</p>}
        {problem && <p className="field-error small">{problem}</p>}

        {/* 1 · Texture */}
        <section className="wizard-step" hidden={step !== 0}>
          <p className="muted small">
            Blocchi uguali vicini si uniscono e il bordo resta solo sui lati liberi (vetro, mattoni,
            pannelli). La cornice è il bordo della texture: dove due blocchi si toccano sparisce.
          </p>
          {loaded && (
            <div className="ctm-source">
              <Canvas
                className="ctm-source-image"
                width={loaded.width}
                height={loaded.height}
                data={Uint8ClampedArray.from(loaded.data)}
              />
              <div className="ctm-source-facts">
                <strong>{source.name}.png</strong>
                <span className="muted small">
                  {loaded.width}×{loaded.height}
                  {problem ? '' : ' · va bene per il metodo completo'}
                </span>
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
              </div>
            </div>
          )}
        </section>

        {/* 2 · Metodo */}
        <section className="wizard-step" hidden={step !== 1}>
          <div className="ctm-methods" role="radiogroup" aria-label="Metodo">
            {CTM_METHODS.map((method) => (
              <button
                key={method.id}
                type="button"
                role="radio"
                aria-checked={method.id === chosen}
                className={method.id === chosen ? 'ctm-method active' : 'ctm-method'}
                onClick={() => setMethod(method.id)}
                title={
                  method.ready ? undefined : 'In arrivo: per ora PackForge crea il metodo completo'
                }
              >
                <Picture picture={method.picture} size={40} />
                <strong>{method.label}</strong>
                <span className="muted small">{method.note}</span>
                <span className="small">{method.ready ? method.tiles : 'in arrivo'}</span>
              </button>
            ))}
          </div>
          {loaded && !problem && (
            <Range
              label="Spessore del bordo"
              value={border}
              unit=" px"
              min={1}
              max={maxBorder(loaded.width)}
              title="Quanti pixel dal bordo formano la cornice che sparisce dove i blocchi si toccano"
              onChange={setBorder}
            />
          )}
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
            Funziona con Continuity (Fabric, anche con Iris) e con OptiFine.
          </p>
        </section>

        {/* 3 · Anteprima: the wall before (every block framed) and after (connected) */}
        <section className="wizard-step wizard-preview" hidden={step !== 2}>
          <div className="wizard-preview-main">
            {loaded && !problem && (
              <>
                <div className="before-after-bar">
                  <span className="lbl" style={{ opacity: both ? 0.4 : 1 }}>
                    Prima
                  </span>
                  <Switch
                    checked={showAfter}
                    onChange={setShowAfter}
                    label="Mostra il risultato"
                    disabled={both}
                  />
                  <span className="lbl" style={{ opacity: both ? 0.4 : 1 }}>
                    Dopo
                  </span>
                  <label className="inline-check small" title="Prima e dopo uno accanto all’altro">
                    <input
                      type="checkbox"
                      checked={both}
                      onChange={(event) => setBoth(event.target.checked)}
                    />
                    Affiancati
                  </label>
                </div>
                <div className={both ? 'before-after-views both' : 'before-after-views'}>
                  <figure className="before-after-view" hidden={!both && showAfter}>
                    <figcaption className="ph">Prima</figcaption>
                    <Canvas className="ctm-wall-before" {...plainWall(loaded)} />
                    <figcaption className="small muted">
                      Ogni blocco ha la sua cornice: il muro sembra una griglia.
                    </figcaption>
                  </figure>
                  <figure className="before-after-view" hidden={!both && !showAfter}>
                    <figcaption className="ph after">Dopo</figcaption>
                    <Canvas className="ctm-wall" {...wallPreview(loaded, tiles, method)} />
                    <figcaption className="small muted">
                      {method === 'horizontal'
                        ? 'Si uniscono solo i blocchi affiancati: righe continue.'
                        : method === 'vertical'
                          ? 'Si uniscono solo i blocchi impilati: colonne continue.'
                          : 'Le cornici interne spariscono: una sola superficie.'}
                    </figcaption>
                  </figure>
                </div>
                <figure className="compare-figure">
                  <Canvas className="ctm-sheet" {...sheetPreview(loaded, tiles)} />
                  <figcaption className="small muted">
                    {method === 'ctm'
                      ? 'I 47 tile (come il template di OptiFine)'
                      : 'I 4 tile: inizio, mezzo, fine, da solo'}
                  </figcaption>
                </figure>
              </>
            )}
          </div>
          <aside className="wizard-facts">
            <h3 className="ph">Cosa succede</h3>
            <div className="wizard-counts">
              <span>
                <strong className={exists ? 'count-over' : 'count-new'}>{fileCount}</strong>
                {exists ? 'riscritti' : 'nuovi'}
              </span>
              <span>
                <strong>1</strong> invariato
              </span>
            </div>
            <p className="small">
              {source.name}.png non viene toccata: i tile sono file nuovi accanto. Prima di scrivere
              viene fatto un backup.
            </p>
            <p className="small warning-text">
              Serve Continuity o OptiFine. Senza, il gioco mostra la texture normale: niente si
              rompe.
            </p>
            <h3 className="ph">File che verranno scritti</h3>
            <ul className="wizard-files">
              <li className={exists ? 'file-overwrite' : 'file-create'}>
                {exists ? '~' : '+'} {folder.replace(/^assets\/minecraft\//, '')}/0.png …{' '}
                {tileCount - 1}.png
              </li>
              {withMaps &&
                mapKinds.map((kind) => (
                  <li key={kind} className={exists ? 'file-overwrite' : 'file-create'}>
                    {exists ? '~' : '+'} i {tileCount} tile {kind === 'normal' ? '_n' : '_s'}
                  </li>
                ))}
              <li className={exists ? 'file-overwrite' : 'file-create'}>
                {exists ? '~' : '+'} {folder.slice(folder.lastIndexOf('/') + 1)}.properties
              </li>
              <li className="file-skip">
                = {source.albedo.slice(source.albedo.lastIndexOf('/') + 1)}
              </li>
            </ul>
            <p className="small muted">
              Cartella: {folder}/{exists && ' · esiste già'}
            </p>
          </aside>
        </section>

        {/* 4 · Applica */}
        <section className="wizard-step" hidden={step !== 3}>
          {phase.status === 'working' && <p className="small">{phase.text}</p>}
          {phase.status === 'done' && (
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
                In gioco servono Continuity (Fabric, anche con Iris) oppure OptiFine: metti due
                blocchi vicini e la cornice in mezzo sparisce. Il backup è in Pack › Backup.
              </p>
            </>
          )}
        </section>

        <footer className="row wizard-foot">
          {phase.status === 'done' ? (
            <button type="button" className="primary" onClick={onClose}>
              Chiudi
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy}>
                Annulla
              </button>
              {step > 0 && step < 3 && (
                <button type="button" onClick={() => setStep(step - 1)}>
                  ‹ Indietro
                </button>
              )}
              {step < 2 && (
                <button
                  type="button"
                  className="primary"
                  disabled={!ready}
                  onClick={() => setStep(step + 1)}
                >
                  Avanti: {CTM_STEPS[step + 1]?.toLowerCase()} ›
                </button>
              )}
              {create47}
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

const CTM_STEPS = ['Texture', 'Metodo', 'Anteprima', 'Applica'] as const

const CTM_METHODS = [
  {
    id: 'ctm',
    label: 'Completo',
    note: 'Si collega in tutte le direzioni: vetri, finestre, blocchi lisci.',
    tiles: '47 tessere',
    picture: CTM_PICTURES.ctm,
    ready: true
  },
  {
    id: 'horizontal',
    label: 'Orizzontale',
    note: 'Solo a destra e sinistra: scaffali, librerie, ringhiere.',
    tiles: '4 tessere',
    picture: CTM_PICTURES.h,
    ready: true
  },
  {
    id: 'vertical',
    label: 'Verticale',
    note: 'Solo sopra e sotto: colonne, pilastri, tronchi.',
    tiles: '4 tessere',
    picture: CTM_PICTURES.v,
    ready: true
  }
] as const

/** The same wall with every block unconnected (what the game shows without the mod). */
function plainWall(image: Image): CanvasData {
  const size = image.width
  const rows = WALL.length
  const cols = WALL[0]!.length
  const width = cols * size
  const height = rows * size
  const data = new Uint8ClampedArray(width * height * 4)
  const tile = Uint8ClampedArray.from({ length: size * size * 4 }, (_, i) => image.data[i] ?? 0)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++)
      if (WALL[r]?.[c] === 1) blit(data, width, tile, size, c * size, r * size)
  }
  return { width, height, data }
}

/** The tiles in the template's 12×4 grid (tile i at column i % 12, row ⌊i / 12⌋). */
function sheetPreview(image: Image, tiles: readonly Uint8ClampedArray[]): CanvasData {
  const size = image.width
  // 47 tiles: the template's 12×4; the line methods' 4 tiles: one row.
  const columns = Math.min(12, Math.max(1, tiles.length))
  const width = size * columns
  const height = size * Math.max(1, Math.ceil(tiles.length / columns))
  const data = new Uint8ClampedArray(width * height * 4)
  tiles.forEach((tile, index) =>
    blit(data, width, tile, size, (index % columns) * size, Math.floor(index / columns) * size)
  )
  return { width, height, data }
}

/** The tiles on a small wall, each picking its tile from its neighbours (like the game). */
function wallPreview(
  image: Image,
  tiles: readonly Uint8ClampedArray[],
  method: CtmMethod = 'ctm'
): CanvasData {
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
      const index =
        method === 'horizontal'
          ? lineTileIndex(filled(r, c - 1), filled(r, c + 1))
          : method === 'vertical'
            ? lineTileIndex(filled(r + 1, c), filled(r - 1, c))
            : ctmTile(mask)
      const tile = tiles[index]
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
