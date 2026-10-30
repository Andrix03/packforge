import { useEffect, useMemo, useState } from 'react'
import { confirmAction } from '../ui/ask'
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
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph, ProgressBar } from '../ui/components'
import { tr } from '../../shared/i18n'

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
  | { status: 'working'; text: string; done?: number; total?: number }
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
  useEscape(onClose, phase.status !== 'working')

  // Writing changes the pack after every file: sizes are read again once, when it is over.
  const writing = phase.status === 'working'
  useEffect(() => {
    if (writing) return
    let cancelled = false
    void (async () => {
      const found: Record<string, { width: number; height: number }> = {}
      for (const texture of textures) {
        if (cancelled) return
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
  }, [pack, textures, writing])

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
              tr(
                '{0} non si può portare a {1}× ({2}×{3})',
                path.split('/').pop(),
                target,
                image.width,
                image.height
              )
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

  const apply = useSingleFlight(async (): Promise<void> => {
    setPhase({ status: 'working', text: tr('Preparo…') })
    const { files, lossy, errors } = await prepare()
    const question =
      tr(
        'Riscrivere {0} a {1}×? Prima viene fatto un backup (lo trovi in Backup, per tornare indietro).',
        files.length === 1 ? '1 file' : `${files.length} file`,
        target
      ) +
      (lossy.length > 0
        ? tr(
            '\n\nRimpicciolendo perdono dettagli: {0}{1}',
            lossy.slice(0, 12).join(', '),
            lossy.length > 12 ? '…' : ''
          )
        : '')
    if (files.length === 0 || !(await confirmAction(question))) {
      if (files.length === 0) setPhase({ status: 'done', written: 0, errors })
      else setPhase({ status: 'setup' })
      return
    }
    const touched = files.flatMap((file) =>
      file.mcmeta !== null ? [file.path, `${file.path}.mcmeta`] : [file.path]
    )
    if (!(await backupBefore(tr('Ridimensiona a {0}×', target), touched))) {
      setPhase({ status: 'setup' })
      return
    }
    let written = 0
    for (const [index, file] of files.entries()) {
      setPhase({
        status: 'working',
        text: tr('Scrivo le texture'),
        done: index + 1,
        total: files.length
      })
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
      if (file.mcmeta !== null) {
        // The PNG has the new size: an old .png.mcmeta would break its animation.
        const meta = await window.api.invoke('texture:saveMcmeta', file.path, file.mcmeta)
        if (!meta.ok) {
          errors.push(`${file.path.split('/').pop()}.mcmeta: ${meta.error}`)
          continue
        }
      }
      written++
    }
    setPhase({ status: 'done', written, errors })
  })

  if (phase.status !== 'setup') {
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="card modal batch" role="dialog" aria-label={tr('Ridimensiona')}>
          <h2>{tr('Ridimensiona')}</h2>
          {phase.status === 'working' ? (
            <ProgressBar label={phase.text} done={phase.done} total={phase.total} />
          ) : (
            <>
              <p className="small" data-testid="resize-result">
                <Glyph name="check" />
                {phase.written === 1 ? '1 file riscritto' : `${phase.written} file riscritti`}
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
        aria-label={tr('Ridimensiona')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{tr('Ridimensiona (pixel netti)')}</h2>
        <p className="muted small">
          {tr(
            'Porta le texture a una sola risoluzione, insieme a _n e _s: il gioco calcola le mipmap dell’atlante sulla texture più piccola, quindi un pack con risoluzioni miste perde qualità da lontano. Solo rapporti interi (×2, ×4, metà…), così i pixel restano netti.'
          )}
        </p>
        {!sizes ? (
          <p className="small">{tr('Leggo le dimensioni…')}</p>
        ) : (
          <p className="small" data-testid="resize-histogram">
            {tr('Nel pack:')} {histogram.map((h) => `${h.resolution}× ${h.count}`).join(', ')}
          </p>
        )}
        <div className="row">
          <label className="small select-field">
            {tr('Risoluzione')}{' '}
            <select
              aria-label={tr('Risoluzione')}
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
            {tr('Seleziona quelle non a {0}×', target)}
          </button>
          <button type="button" className="small-button" onClick={() => setSelected(new Set())}>
            {tr('Nessuna')}
          </button>
        </div>
        <input
          type="search"
          aria-label={tr('Filtra texture')}
          placeholder={tr('Filtra per nome o cartella')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="batch-list" aria-label={tr('Texture')}>
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
                    {size && !factor && tr(', non si può portare a questa risoluzione')}
                    {factor && factor.up === 1 && factor.down === 1 && tr(', già così')}
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
          {tr('Ridimensiona anche _n e _s (valori esatti, nessuna sfumatura)')}
        </label>
        <p className="small" data-testid="resize-summary">
          {tr('Da ridimensionare: {0}', work.length)}
          {incompatible.length > 0 && `, incompatibili: ${incompatible.length}`}
        </p>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={work.length === 0}
            onClick={() => apply()}
          >
            {tr('Ridimensiona {0}', work.length === 1 ? '1 texture' : `${work.length} texture`)}
          </button>
          <button type="button" onClick={onClose}>
            {tr('Annulla')}
          </button>
        </div>
      </div>
    </div>
  )
}
