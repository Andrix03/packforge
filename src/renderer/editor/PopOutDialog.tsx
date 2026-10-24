import { useEffect, useMemo, useRef, useState } from 'react'
import { modelPath, resolveModel, type ResolvedModel } from '../../shared/blockModel'
import { tr } from '../../shared/i18n'
import type { RgbaImage } from '../../shared/pngCodec'
import { ALL_FACES, popOutModel } from '../../shared/popOut'
import { backupBefore } from '../packs/backup'
import { errorMessage, loadPng } from '../packs/packFetch'
import { resolveAssetUrl, type AssetSources } from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'

const DEPTHS = [0.5, 1, 2] as const
const MAP_SCALE = 12

async function loadJson(sources: AssetSources, path: string): Promise<unknown> {
  const url = resolveAssetUrl(sources, path)
  if (!url) return null
  try {
    return await (await fetch(url, { cache: 'no-store' })).json()
  } catch {
    return null
  }
}

/** A full cube drawing `texture` on all six faces (more elements: raised pixels, by us). */
function isCubeOf(model: ResolvedModel, texture: string): boolean {
  const [cube, ...rest] = model.elements
  if (!cube) return false
  const full =
    cube.from.every((v) => v === 0) &&
    cube.to.every((v) => v === 16) &&
    Object.keys(cube.faces).length === 6
  const uses = (faces: ResolvedModel['elements'][number]['faces']): boolean =>
    Object.values(faces).every((f) => f?.texture?.id === texture)
  return full && uses(cube.faces) && rest.every((e) => uses(e.faces))
}

/** `#rrggbb` of a pixel. */
function hexAt(image: RgbaImage, i: number): string {
  return `#${[0, 1, 2].map((c) => image.data[i * 4 + c]!.toString(16).padStart(2, '0')).join('')}`
}

/**
 * "Pixels that pop out": colours of a full-cube block texture (ore spots, gems…) raised as small
 * cuboids on its faces, written as the block's model in the pack (vanilla JSON, no mods).
 */
export function PopOutDialog({
  path,
  sources,
  selection,
  onClose,
  onDone
}: {
  path: string
  sources: AssetSources
  /** The editor's selection over the texture (one byte per pixel), or null. */
  selection: Uint8Array | null
  onClose: () => void
  onDone: (written: string[]) => void
}): React.JSX.Element {
  const m = /^assets\/([^/]+)\/textures\/(block\/.+)\.png$/.exec(path)
  const texture = m ? `${m[1]}:${m[2]}` : ''
  const file = modelPath(texture)
  const [loaded, setLoaded] = useState<{ image: RgbaImage | null; cube: boolean } | null>(null)
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  // With a selection in the editor, its pixels are the default choice.
  const [bySelection, setBySelection] = useState(selection !== null)
  const [depth, setDepth] = useState<number>(1)
  const [sidesOnly, setSidesOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  useEscape(onClose, !working)

  useEffect(() => {
    let current = true
    void (async () => {
      const image = await loadPng(sources.pack, path).catch(() => null)
      const model = await resolveModel(texture, (p) => loadJson(sources, p))
      if (current) setLoaded({ image, cube: isCubeOf(model, texture) })
    })()
    return () => {
      current = false
    }
  }, [sources, path, texture])

  const image = loaded?.image ?? null
  // The texture's colours, most used first (transparent pixels never pop).
  const palette = useMemo(() => {
    if (!image) return []
    const counts = new Map<string, number>()
    for (let i = 0; i < image.width * image.height; i++) {
      if (image.data[i * 4 + 3] === 0) continue
      const hex = hexAt(image, i)
      counts.set(hex, (counts.get(hex) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 48)
  }, [image])
  const mask =
    bySelection && selection && image && selection.length === image.width * image.height
      ? selection
      : null
  const picks = (img: RgbaImage, i: number): boolean =>
    img.data[i * 4 + 3]! > 0 && (mask ? mask[i] === 1 : chosen.has(hexAt(img, i)))
  const isChosen = (x: number, y: number): boolean => !!image && picks(image, y * image.width + x)
  const faces = sidesOnly ? ALL_FACES.filter((f) => f !== 'up' && f !== 'down') : ALL_FACES
  const result =
    image && (mask || chosen.size > 0)
      ? popOutModel(image.width, image.height, isChosen, texture, { depth, faces })
      : null

  const mapRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = mapRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !image) return
    canvas.width = image.width * MAP_SCALE
    canvas.height = image.height * MAP_SCALE
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const i = y * image.width + x
        if (image.data[i * 4 + 3] === 0) continue
        const pops = picks(image, i)
        context.globalAlpha = pops ? 1 : 0.3
        context.fillStyle = hexAt(image, i)
        context.fillRect(x * MAP_SCALE, y * MAP_SCALE, MAP_SCALE, MAP_SCALE)
      }
    }
    context.globalAlpha = 1
    // `picks` follows chosen and mask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, chosen, mask])

  const save = useSingleFlight(async (): Promise<void> => {
    if (!result?.ok) return
    if (sources.pack.files.has(file)) {
      if (!(await backupBefore(tr('Pixel in rilievo: {0}', texture), [file]))) return
    }
    setWorking(true)
    setError(null)
    try {
      const saved = await window.api.invoke(
        'model:saveJson',
        file,
        `${JSON.stringify(result.model, null, 2)}\n`
      )
      if (saved.ok) onDone([file])
      else setError(saved.error)
    } catch (e) {
      setError(errorMessage(e))
    }
    setWorking(false)
  })

  const problem = !loaded
    ? null
    : !image
      ? tr('Salva la texture nel pack prima.')
      : !loaded.cube
        ? tr(
            'Il modello di questo blocco non è un cubo con questa texture su tutte le facce: per ora solo blocchi così (minerali, pietre…).'
          )
        : null
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form pop-out-dialog"
        role="dialog"
        aria-label={tr('Pixel in rilievo')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph name="up" />
          {tr('Pixel in rilievo: {0}', texture.replace(/^minecraft:/, ''))}
        </h2>
        <p className="muted small">
          {tr(
            'I colori che scegli escono dal blocco come piccoli cubetti, su ogni faccia (minerali 3D). Contro un altro blocco non si vedono, come le facce. Modello vanilla, funziona senza mod.'
          )}
        </p>
        {!loaded ? (
          <p className="muted">{tr('Leggo la texture e il modello…')}</p>
        ) : problem ? (
          <p className="field-error small" data-testid="pop-problem">
            {problem}
          </p>
        ) : (
          <div className="pop-out-body">
            <canvas ref={mapRef} className="pop-out-map sunken" aria-hidden="true" />
            <div className="pop-out-options">
              {selection && (
                <div className="tabs small-tabs" role="radiogroup" aria-label={tr('Cosa esce')}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={bySelection}
                    className={bySelection ? 'tab active' : 'tab'}
                    onClick={() => setBySelection(true)}
                  >
                    {tr('La selezione')}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!bySelection}
                    className={!bySelection ? 'tab active' : 'tab'}
                    onClick={() => setBySelection(false)}
                  >
                    {tr('Per colore')}
                  </button>
                </div>
              )}
              {!mask && <span className="lbl">{tr('Colori che escono')}</span>}
              <div
                className="pop-out-colors"
                role="group"
                aria-label={tr('Colori che escono')}
                hidden={mask !== null}
              >
                {palette.map(([hex, count]) => (
                  <button
                    key={hex}
                    type="button"
                    className="pop-color"
                    aria-pressed={chosen.has(hex)}
                    title={tr('{0}: {1} pixel', hex, count)}
                    style={{ background: hex }}
                    onClick={() => {
                      const next = new Set(chosen)
                      if (next.has(hex)) next.delete(hex)
                      else next.add(hex)
                      setChosen(next)
                    }}
                  />
                ))}
              </div>
              <span className="lbl">{tr('Quanto escono')}</span>
              <div className="tabs small-tabs" role="radiogroup" aria-label={tr('Quanto escono')}>
                {DEPTHS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={depth === value}
                    className={depth === value ? 'tab active' : 'tab'}
                    onClick={() => setDepth(value)}
                  >
                    {value === 0.5 ? tr('Mezzo pixel') : tr('{0} pixel', value)}
                  </button>
                ))}
              </div>
              <label className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={sidesOnly}
                  onChange={(event) => setSidesOnly(event.target.checked)}
                />
                {tr('Solo sui lati (non sopra e sotto)')}
              </label>
              {result && !result.ok && <p className="field-error small">{result.error}</p>}
              {result?.ok && (
                <p className="small" data-testid="pop-plan">
                  {tr('{0} elementi, {1} facce.', result.elements, result.faces)}{' '}
                  {result.heavy &&
                    tr(
                      'Modello pesante: tanti blocchi così rallentano il gioco. Scegli meno colori.'
                    )}
                </p>
              )}
            </div>
          </div>
        )}
        <p className="muted small path">{file}</p>
        {error && <p className="field-error small">{error}</p>}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={!result?.ok || problem !== null || working}
            onClick={() => save()}
          >
            {tr('Scrivi il modello')}
          </button>
          <button type="button" onClick={onClose} disabled={working}>
            {tr('Annulla')}
          </button>
        </div>
      </div>
    </div>
  )
}
