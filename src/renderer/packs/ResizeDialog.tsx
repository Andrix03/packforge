import { useEffect, useMemo, useState } from 'react'
import { readPngSize } from '../../shared/png'
import {
  factorBetween,
  RESOLUTIONS,
  resolutionHistogram,
  scaleMcmeta,
  scaleNearest,
  type Factor
} from '../../shared/resize'
import type { TextureEntry } from '../../shared/textures'
import { backupBefore } from './backup'
import { errorMessage, fetchBytes, fetchText, loadPng, type FileSource } from './packFetch'

/** Rows drawn at most (the filter narrows big packs). */
const MAX_ROWS = 400

interface Prepared {
  path: string
  width: number
  height: number
  data: Uint8ClampedArray
  /** New .png.mcmeta text, when its frame sizes change. */
  mcmeta: string | null
}

type Phase =
  | { status: 'setup' }
  | { status: 'working'; text: string }
  | { status: 'done'; written: number; errors: string[] }

/** Brings textures (and their `_n` / `_s`) to one resolution with nearest-neighbour scaling. */
export function ResizeDialog({
  pack,
  textures,
  onClose
}: {
  pack: FileSource
  /** The pack's textures that can be resized (maps travel with their texture). */
  textures: readonly TextureEntry[]
  onClose: () => void
}): React.JSX.Element {
  const [sizes, setSizes] = useState<Readonly<
    Record<string, { width: number; height: number }>
  > | null>(null)
  const [target, setTarget] = useState<number>(32)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [withMaps, setWithMaps] = useState(true)
  const [phase, setPhase] = useState<Phase>({ status: 'setup' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const found: Record<string, { width: number; height: number }> = {}
      for (const texture of textures) {
        const size = readPngSize(
          await fetchBytes(pack, texture.albedo).catch(() => new Uint8Array())
        )
        if (size) found[texture.albedo] = size
      }
      if (!cancelled) setSizes(found)
    })()
    return () => {
      cancelled = true
    }
  }, [pack, textures])

  const histogram = useMemo(
    () => (sizes ? resolutionHistogram(Object.values(sizes).map((s) => s.width)) : []),
    [sizes]
  )
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q === '' ? textures : textures.filter((t) => t.key.toLowerCase().includes(q))
  }, [textures, query])
  const factorOf = (texture: TextureEntry): Factor | null => {
    const size = sizes?.[texture.albedo]
    return size ? factorBetween(size.width, target) : null
  }
  const chosen = textures.filter((t) => selected.has(t.albedo))
  const work = chosen.filter((t) => {
    const f = factorOf(t)
    return f !== null && (f.up !== 1 || f.down !== 1)
  })
  const incompatible = chosen.filter((t) => sizes?.[t.albedo] && !factorOf(t))

  async function prepare(): Promise<{ files: Prepared[]; lossy: string[]; errors: string[] }> {
    const files: Prepared[] = []
    const lossy: string[] = []
    const errors: string[] = []
    for (const texture of work) {
      const factor = factorOf(texture)!
      try {
        const own: Prepared[] = []
        const paths = [
          texture.albedo,
          ...(withMaps
            ? [texture.normal, texture.specular].filter((p): p is string => p !== null)
            : [])
        ]
        for (const path of paths) {
          const image = await loadPng(pack, path)
          const scaled = scaleNearest(image, factor)
          if (!scaled)
            throw new Error(
              `${path.split('/').pop()} non si può portare a ${target}× (${image.width}×${image.height})`
            )
          if (scaled.lossy && !lossy.includes(texture.name)) lossy.push(texture.name)
          const mcmetaPath = `${path}.mcmeta`
          const mcmeta = pack.files.has(mcmetaPath)
            ? scaleMcmeta(await fetchText(pack, mcmetaPath), factor)
            : null
          own.push({ path, width: scaled.width, height: scaled.height, data: scaled.data, mcmeta })
        }
        files.push(...own)
      } catch (error) {
        errors.push(`${texture.name}: ${errorMessage(error)}`)
      }
    }
    return { files, lossy, errors }
  }

  async function apply(): Promise<void> {
    setPhase({ status: 'working', text: 'Preparo…' })
    const { files, lossy, errors } = await prepare()
    const question =
      `Riscrivere ${files.length === 1 ? '1 file' : `${files.length} file`} a ${target}×? Prima viene fatto un backup (🕘 Backup per tornare indietro).` +
      (lossy.length > 0
        ? `\n\nRimpicciolendo perdono dettagli: ${lossy.slice(0, 12).join(', ')}${lossy.length > 12 ? '…' : ''}`
        : '')
    if (files.length === 0 || !window.confirm(question)) {
      if (files.length === 0) setPhase({ status: 'done', written: 0, errors })
      else setPhase({ status: 'setup' })
      return
    }
    const touched = files.flatMap((file) =>
      file.mcmeta !== null ? [file.path, `${file.path}.mcmeta`] : [file.path]
    )
    if (!(await backupBefore(`Ridimensiona a ${target}×`, touched))) {
      setPhase({ status: 'setup' })
      return
    }
    let written = 0
    for (const [index, file] of files.entries()) {
      setPhase({ status: 'working', text: `Scrivo… ${index + 1}/${files.length}` })
      const saved = await window.api.invoke(
        'texture:save',
        file.path,
        file.width,
        file.height,
        new Uint8Array(file.data)
      )
      if (!saved.ok) {
        errors.push(`${file.path.split('/').pop()}: ${saved.error}`)
        continue
      }
      if (file.mcmeta !== null)
        await window.api.invoke('texture:saveMcmeta', file.path, file.mcmeta)
      written++
    }
    setPhase({ status: 'done', written, errors })
  }

  if (phase.status !== 'setup') {
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="card modal batch" role="dialog" aria-label="Ridimensiona">
          <h2>Ridimensiona</h2>
          {phase.status === 'working' ? (
            <p className="small">{phase.text}</p>
          ) : (
            <>
              <p className="small" data-testid="resize-result">
                ✓ {phase.written === 1 ? '1 file riscritto' : `${phase.written} file riscritti`}
                {phase.errors.length > 0 && ` · ✗ ${phase.errors.length} errori`}
              </p>
              {phase.errors.map((error) => (
                <p key={error} className="field-error small">
                  {error}
                </p>
              ))}
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
        aria-label="Ridimensiona"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Ridimensiona (pixel netti)</h2>
        <p className="muted small">
          Porta le texture a una sola risoluzione, insieme a _n e _s: il gioco calcola le mipmap
          dell’atlante sulla texture più piccola, quindi un pack con risoluzioni miste perde qualità
          da lontano. Solo rapporti interi (×2, ×4, ½…), così i pixel restano netti.
        </p>
        {!sizes ? (
          <p className="small">Leggo le dimensioni…</p>
        ) : (
          <p className="small" data-testid="resize-histogram">
            Nel pack: {histogram.map((h) => `${h.resolution}× ${h.count}`).join(' · ')}
          </p>
        )}
        <div className="row">
          <label className="small select-field">
            Risoluzione{' '}
            <select
              aria-label="Risoluzione"
              value={target}
              onChange={(event) => setTarget(Number(event.target.value))}
            >
              {RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}×
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="small-button"
            disabled={!sizes}
            onClick={() =>
              setSelected(
                new Set(
                  textures
                    .filter((t) => sizes?.[t.albedo] && sizes[t.albedo]!.width !== target)
                    .map((t) => t.albedo)
                )
              )
            }
          >
            Seleziona quelle non a {target}×
          </button>
          <button type="button" className="small-button" onClick={() => setSelected(new Set())}>
            Nessuna
          </button>
        </div>
        <input
          type="search"
          aria-label="Filtra texture"
          placeholder="Filtra per nome o cartella"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="batch-list" aria-label="Texture">
          {visible.slice(0, MAX_ROWS).map((texture) => {
            const size = sizes?.[texture.albedo]
            const factor = factorOf(texture)
            return (
              <li key={texture.albedo}>
                <label className="inline-check small">
                  <input
                    type="checkbox"
                    checked={selected.has(texture.albedo)}
                    onChange={(event) =>
                      setSelected((all) => {
                        const next = new Set(all)
                        if (event.target.checked) next.add(texture.albedo)
                        else next.delete(texture.albedo)
                        return next
                      })
                    }
                  />
                  {texture.name}
                  <span className="muted">
                    {size ? `${size.width}×${size.height}` : '…'}
                    {size && !factor && ' · non si può portare a questa risoluzione'}
                    {factor && factor.up === 1 && factor.down === 1 && ' · già così'}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
        <label className="inline-check small">
          <input
            type="checkbox"
            checked={withMaps}
            onChange={(event) => setWithMaps(event.target.checked)}
          />
          Ridimensiona anche _n e _s (valori esatti, nessuna sfumatura)
        </label>
        <p className="small" data-testid="resize-summary">
          Da ridimensionare: {work.length}
          {incompatible.length > 0 && ` · incompatibili: ${incompatible.length}`}
        </p>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={work.length === 0}
            onClick={() => void apply()}
          >
            Ridimensiona {work.length === 1 ? '1 texture' : `${work.length} texture`}
          </button>
          <button type="button" onClick={onClose}>
            Annulla
          </button>
        </div>
      </div>
    </div>
  )
}
