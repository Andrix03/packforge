import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_RECOLOR,
  DYES,
  dyeOf,
  meanColorHex,
  previewSample,
  recolor,
  variantName,
  type Dye,
  type RecolorOptions
} from '../../shared/colorVariants'
import { mapPath, type MapKind } from '../../shared/labpbr'
import type { DecodedPng } from '../../shared/pngCodec'
import type { TextureEntry } from '../../shared/textures'
import { Range } from '../editor/GeneratorPanel'
import { mapMcmeta } from '../editor/frames'
import { backupBefore } from './backup'
import { errorMessage, fetchText, loadPng, type FileSource } from './packFetch'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph, ProgressBar } from '../ui/components'
import { tr } from '../../shared/i18n'

type ColorMode = 'game' | 'dye'

/** Largest side of the previews (the files are made at full size). */
const PREVIEW_SIDE = 128

interface Variant {
  dye: Dye
  path: string
  name: string
  /** The source texture itself. */
  original: boolean
  exists: boolean
  hex: string
  fromGame: boolean
  /** Preview pixels (at most PREVIEW_SIDE). */
  pixels: Uint8ClampedArray
}

type Phase =
  | { status: 'setup' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; written: number; errors: string[] }

/** Every dye color of one texture (e.g. all the wools), with its maps if wanted. */
export function VariantsDialog({
  source,
  pack,
  vanilla,
  onClose
}: {
  source: TextureEntry
  pack: FileSource
  vanilla: FileSource | null
  onClose: () => void
}): React.JSX.Element {
  const [image, setImage] = useState<DecodedPng | { error: string } | null>(null)
  const [gameColors, setGameColors] = useState<Readonly<Record<string, string>>>({})
  const [mode, setMode] = useState<ColorMode>('game')
  const [options, setOptions] = useState<RecolorOptions>(DEFAULT_RECOLOR)
  const own = dyeOf(source.name)
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        DYES.filter((dye) => {
          const path = `${source.folder}/${variantName(source.name, dye)}.png`
          return dye.id !== own?.id && !pack.files.has(path)
        }).map((dye) => dye.id)
      )
  )
  const hasMaps = source.normal !== null || source.specular !== null
  const [copyMaps, setCopyMaps] = useState(hasMaps)
  const [overwrite, setOverwrite] = useState(false)
  const [phase, setPhase] = useState<Phase>({ status: 'setup' })
  useEscape(onClose, phase.status !== 'running')

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

  // The game's own color of each variant (its mean color: a picked color, no pixels copied).
  useEffect(() => {
    if (!vanilla) return
    let cancelled = false
    const paths = DYES.map((dye) => `${source.folder}/${variantName(source.name, dye)}.png`)
    void Promise.all(
      paths
        .filter((path) => vanilla.files.has(path))
        .map(async (path) => {
          const png = await loadPng(vanilla, path).catch(() => null)
          const hex = png ? meanColorHex(png.data) : null
          return [path, hex] as const
        })
    ).then((entries) => {
      if (cancelled) return
      const colors: Record<string, string> = {}
      for (const [path, hex] of entries) if (hex) colors[path] = hex
      setGameColors(colors)
    })
    return () => {
      cancelled = true
    }
  }, [vanilla, source.folder, source.name])

  const loaded = image && !('error' in image) ? image : null
  const sample = useMemo(() => (loaded ? previewSample(loaded, PREVIEW_SIDE) : null), [loaded])
  // Slider drags stay smooth: the previews follow a step behind.
  const previewOptions = useDeferredValue(options)
  const variants = useMemo<Variant[]>(() => {
    if (!sample) return []
    return DYES.map((dye) => {
      const name = variantName(source.name, dye)
      const path = `${source.folder}/${name}.png`
      const game = mode === 'game' ? gameColors[path] : undefined
      const hex = game ?? dye.hex
      return {
        dye,
        path,
        name,
        original: path === source.albedo,
        exists: pack.files.has(path),
        hex,
        fromGame: game !== undefined,
        pixels: path === source.albedo ? sample.data : recolor(sample.data, hex, previewOptions)
      }
    })
  }, [sample, source, mode, gameColors, previewOptions, pack.files])

  const chosen = variants.filter((v) => !v.original && checked.has(v.dye.id))
  const toWrite = chosen.filter((v) => !v.exists || overwrite)
  const overwriting = toWrite.filter((v) => v.exists).length

  const create = useSingleFlight(async (): Promise<void> => {
    if (!loaded) return
    if (
      overwriting > 0 &&
      !window.confirm(
        tr(
          'Sovrascrivere {0}? Prima viene fatto un backup (lo trovi in Backup, per tornare indietro).',
          overwriting === 1 ? tr('1 texture esistente') : tr('{0} texture esistenti', overwriting)
        )
      )
    ) {
      return
    }
    const mapKinds = copyMaps
      ? (['normal', 'specular'] as const).filter((kind) =>
          kind === 'normal' ? source.normal !== null : source.specular !== null
        )
      : []
    const touched = toWrite.flatMap((variant) => {
      const files = [variant.path, ...mapKinds.map((kind) => mapPath(variant.path, kind))]
      return source.mcmeta ? files.flatMap((file) => [file, `${file}.mcmeta`]) : files
    })
    if (!(await backupBefore(tr('Varianti di colore di {0}', source.name), touched))) return
    setPhase({ status: 'running', done: 0, total: toWrite.length })
    const errors: string[] = []
    let written = 0
    const mcmetaText = source.mcmeta ? await fetchText(pack, source.mcmeta).catch(() => null) : null
    const maps: Array<{ kind: MapKind; png: DecodedPng }> = []
    if (copyMaps) {
      for (const kind of ['normal', 'specular'] as const) {
        const path = kind === 'normal' ? source.normal : source.specular
        if (path) {
          const png = await loadPng(pack, path).catch(() => null)
          if (png) maps.push({ kind, png })
        }
      }
    }
    for (const [index, variant] of toWrite.entries()) {
      try {
        const saved = await window.api.invoke(
          'texture:save',
          variant.path,
          loaded.width,
          loaded.height,
          new Uint8Array(recolor(loaded.data, variant.hex, options))
        )
        if (!saved.ok) throw new Error(saved.error)
        written++
        if (mcmetaText !== null) {
          const meta = await window.api.invoke('texture:saveMcmeta', variant.path, mcmetaText)
          if (!meta.ok) throw new Error(meta.error)
        }
        // The relief and material are the same: the maps are copied as they are.
        for (const { kind, png } of maps) {
          const target = mapPath(variant.path, kind)
          if (pack.files.has(target) && !overwrite) continue
          const copied = await window.api.invoke(
            'texture:save',
            target,
            png.width,
            png.height,
            new Uint8Array(png.data)
          )
          if (!copied.ok) throw new Error(copied.error)
          const meta = mapMcmeta(mcmetaText, png.width / loaded.width)
          if (meta !== null) {
            const metaSaved = await window.api.invoke('texture:saveMcmeta', target, meta)
            if (!metaSaved.ok) throw new Error(metaSaved.error)
          }
        }
      } catch (error) {
        errors.push(`${variant.name}: ${errorMessage(error)}`)
      }
      setPhase({ status: 'running', done: index + 1, total: toWrite.length })
    }
    setPhase({ status: 'done', written, errors })
  })

  if (phase.status !== 'setup') {
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="card modal batch" role="dialog" aria-label={tr('Varianti di colore')}>
          <h2>{tr('Varianti di colore')}</h2>
          {phase.status === 'running' ? (
            <ProgressBar label={tr('Creo le varianti')} done={phase.done} total={phase.total} />
          ) : (
            <>
              <p className="small" data-testid="variants-result">
                <Glyph name="check" />
                {phase.written === 1
                  ? tr('1 texture creata')
                  : tr('{0} texture create', phase.written)}
                {phase.errors.length > 0 && tr(', {0} errori', phase.errors.length)}
              </p>
              {phase.errors.map((error) => (
                <p key={error} className="field-error small">
                  {error}
                </p>
              ))}
              <div className="row">
                <button type="button" className="primary" onClick={onClose}>
                  {tr('Chiudi')}
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
        aria-label={tr('Varianti di colore')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{tr('Varianti di colore di {0}', source.name)}</h2>
        <p className="muted small">
          {tr(
            'Ricolora la texture con i 16 colori dei coloranti: ombre e dettagli restano, cambia il colore medio.'
          )}
        </p>
        {image && 'error' in image && <p className="field-error small">{image.error}</p>}
        <div className="row">
          <label
            className="inline-check small"
            title={tr(
              'Il colore medio della stessa texture nel gioco (lana, cemento, terracotta hanno toni diversi)'
            )}
          >
            <input
              type="radio"
              name="variant-colors"
              checked={mode === 'game'}
              disabled={!vanilla}
              onChange={() => setMode('game')}
            />
            {tr('Colori come nel gioco')}
            {!vanilla && tr(' (carica il jar vanilla)')}
          </label>
          <label className="inline-check small" title={tr('I colori ufficiali dei coloranti')}>
            <input
              type="radio"
              name="variant-colors"
              checked={mode === 'dye' || !vanilla}
              onChange={() => setMode('dye')}
            />
            {tr('Colori dei coloranti')}
          </label>
        </div>
        <Range
          label={tr('Contrasto')}
          value={Math.round(options.contrast * 100)}
          unit="%"
          min={0}
          max={150}
          title={tr('Quanto restano le luci e le ombre della texture originale')}
          onChange={(value) => setOptions({ ...options, contrast: value / 100 })}
        />
        <Range
          label={tr('Sfumature di colore')}
          value={Math.round(options.colorDetail * 100)}
          unit="%"
          min={0}
          max={100}
          title={tr('Quanto restano le variazioni di tinta dell’originale; 0 = un solo colore')}
          onChange={(value) => setOptions({ ...options, colorDetail: value / 100 })}
        />
        <div className="variant-grid" aria-label={tr('Varianti')}>
          {variants.map((variant) => (
            <label
              key={variant.dye.id}
              className={variant.original ? 'variant original' : 'variant'}
              title={`${variant.path}${variant.fromGame ? tr(', colore del gioco') : tr(', colore del colorante')} #${variant.hex}`}
            >
              {sample && (
                <Thumb width={sample.width} height={sample.height} pixels={variant.pixels} />
              )}
              <span className="small">
                <input
                  type="checkbox"
                  disabled={variant.original}
                  checked={!variant.original && checked.has(variant.dye.id)}
                  onChange={(event) =>
                    setChecked((all) => {
                      const next = new Set(all)
                      if (event.target.checked) next.add(variant.dye.id)
                      else next.delete(variant.dye.id)
                      return next
                    })
                  }
                />
                {variant.name}
              </span>
              {variant.original ? (
                <span className="badge">{tr('originale')}</span>
              ) : (
                variant.exists && <span className="badge unsaved">{tr('esiste già')}</span>
              )}
            </label>
          ))}
        </div>
        {hasMaps && (
          <label className="inline-check small">
            <input
              type="checkbox"
              checked={copyMaps}
              onChange={(event) => setCopyMaps(event.target.checked)}
            />
            {tr('Copia anche _n e _s (stesso rilievo e materiale)')}
          </label>
        )}
        <label className="inline-check small">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(event) => setOverwrite(event.target.checked)}
          />
          {tr('Sovrascrivi le texture che esistono già')}
        </label>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={toWrite.length === 0 || !loaded}
            onClick={() => create()}
          >
            {tr('Crea {0}', toWrite.length === 1 ? '1 texture' : `${toWrite.length} texture`)}
          </button>
          <button type="button" onClick={onClose}>
            {tr('Annulla')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Thumb({
  width,
  height,
  pixels
}: {
  width: number
  height: number
  pixels: Uint8ClampedArray
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = ref.current?.getContext('2d')
    if (!context) return
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0)
  }, [pixels, width, height])
  return <canvas ref={ref} className="variant-thumb" width={width} height={height} />
}
