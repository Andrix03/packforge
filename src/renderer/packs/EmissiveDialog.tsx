import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_EMISSIVE_SUFFIX,
  EMISSIVE_PROPERTIES_PATH,
  emissiveOverlay,
  emissivePath
} from '../../shared/emissive'
import { tr } from '../../shared/i18n'
import type { RgbaImage } from '../../shared/pngCodec'
import { backupBefore } from './backup'
import { errorMessage, fetchText, loadPng, type FileSource } from './packFetch'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph, RangeInput, SwitchRow } from '../ui/components'

interface Candidate {
  albedo: string
  image: RgbaImage
  specular: RgbaImage
}

const PREVIEW = 4

/**
 * Emissive overlays for OptiFine / Continuity (`<name>_e.png`, drawn fullbright): made for every
 * pack texture whose `_s` map emits light (LabPBR alpha), from the texture's own colours. Existing
 * `_e` files are kept unless replacing is chosen (backup first); animations get the texture's
 * .png.mcmeta.
 */
export function EmissiveDialog({
  pack,
  onClose
}: {
  pack: FileSource
  onClose: () => void
}): React.JSX.Element {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [cutoff, setCutoff] = useState(0)
  const [full, setFull] = useState(false)
  const [replace, setReplace] = useState(false)
  const [phase, setPhase] = useState<
    | { status: 'setup' }
    | { status: 'working' }
    | { status: 'done'; written: number; errors: string[] }
  >({ status: 'setup' })
  useEscape(onClose, phase.status !== 'working')

  useEffect(() => {
    let current = true
    void (async () => {
      const found: Candidate[] = []
      for (const path of [...pack.files].sort()) {
        if (!path.endsWith('_s.png')) continue
        const albedo = `${path.slice(0, -'_s.png'.length)}.png`
        if (!pack.files.has(albedo)) continue
        try {
          const [image, specular] = await Promise.all([loadPng(pack, albedo), loadPng(pack, path)])
          found.push({ albedo, image, specular })
        } catch {
          // Unreadable: skipped.
        }
      }
      if (current) setCandidates(found)
    })()
    return () => {
      current = false
    }
  }, [pack])

  const results = (candidates ?? []).map((c) => ({
    ...c,
    overlay: emissiveOverlay(c.image, c.specular, { cutoff, full })
  }))
  const glowing = results.filter((r) => r.overlay)
  const target = (r: (typeof results)[number]): string => emissivePath(r.albedo)
  const kept = glowing.filter((r) => !replace && pack.files.has(target(r)))
  const toWrite = glowing.filter((r) => replace || !pack.files.has(target(r)))

  const apply = useSingleFlight(async (): Promise<void> => {
    const replaced = toWrite.map(target).filter((p) => pack.files.has(p))
    if (!(await backupBefore(tr('Texture emissive _e'), replaced))) return
    setPhase({ status: 'working' })
    let written = 0
    const errors: string[] = []
    for (const r of toWrite) {
      try {
        const file = target(r)
        const saved = await window.api.invoke(
          'texture:save',
          file,
          r.image.width,
          r.image.height,
          new Uint8Array(r.overlay!)
        )
        if (!saved.ok) throw new Error(saved.error)
        // An animated texture: the overlay follows the same frames.
        if (pack.files.has(`${r.albedo}.mcmeta`)) {
          const mcmeta = await fetchText(pack, `${r.albedo}.mcmeta`)
          const copied = await window.api.invoke('texture:saveMcmeta', file, mcmeta)
          if (!copied.ok) throw new Error(copied.error)
        }
        written++
      } catch (e) {
        errors.push(`${r.albedo}: ${errorMessage(e)}`)
      }
    }
    // OptiFine reads `_e` by default; the explicit file also covers mods that look for it.
    if (written > 0 && !pack.files.has(EMISSIVE_PROPERTIES_PATH)) {
      const saved = await window.api.invoke('pack:saveEmissiveProperties', DEFAULT_EMISSIVE_SUFFIX)
      if (!saved.ok) errors.push(saved.error)
    }
    setPhase({ status: 'done', written, errors })
  })

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form emissive-dialog"
        role="dialog"
        aria-label={tr('Texture emissive')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph name="dot" />
          {tr('Texture emissive (_e)')}
        </h2>
        <p className="muted small">
          {tr(
            'Le parti che brillano nella mappa _s diventano una texture _e: con OptiFine o Continuity restano accese anche al buio, senza shader.'
          )}
        </p>
        {candidates === null ? (
          <p className="muted">{tr('Leggo le texture con la mappa _s…')}</p>
        ) : glowing.length === 0 ? (
          <p data-testid="emissive-none">
            {tr('Nessuna mappa _s del pack emette luce (canale alfa sotto 255).')}
          </p>
        ) : (
          <>
            <label className="item-number small">
              <span>
                {tr('Soglia')} <b>{Math.round(cutoff * 100)}%</b>
              </span>
              <RangeInput
                min={0}
                max={0.9}
                step={0.05}
                value={cutoff}
                aria-label={tr('Soglia')}
                onChange={(event) => setCutoff(Number(event.target.value))}
              />
            </label>
            <SwitchRow
              checked={full}
              onChange={setFull}
              label={tr('Luce piena')}
              note={tr('Ogni pixel che brilla a piena luminosità, invece di seguire la mappa.')}
            />
            <div className="emissive-previews">
              {glowing.slice(0, PREVIEW).map((r) => (
                <figure key={r.albedo} className="emissive-figure">
                  <OverlayPreview image={r.image} overlay={r.overlay!} />
                  <figcaption className="muted small">
                    {r.albedo.replace(/^.*\//, '').replace(/\.png$/, '')}
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="small" data-testid="emissive-plan">
              {tr('{0} texture con luce, {1} file _e da scrivere.', glowing.length, toWrite.length)}
            </p>
            {kept.length > 0 && (
              <SwitchRow
                checked={replace}
                onChange={setReplace}
                label={tr('Sostituisci i _e che esistono già ({0})', kept.length)}
              />
            )}
          </>
        )}
        {phase.status === 'done' && (
          <>
            <p data-testid="emissive-result">{tr('{0} file _e scritti.', phase.written)}</p>
            {phase.errors.map((error) => (
              <p key={error} className="field-error small">
                {error}
              </p>
            ))}
          </>
        )}
        <div className="row">
          {phase.status === 'done' ? (
            <button type="button" className="primary" onClick={onClose}>
              {tr('Fatto')}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="primary"
                disabled={toWrite.length === 0 || phase.status === 'working'}
                onClick={() => apply()}
              >
                {tr('Scrivi {0} file _e', toWrite.length)}
              </button>
              <button type="button" onClick={onClose} disabled={phase.status === 'working'}>
                {tr('Annulla')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** The texture dimmed (night) with the overlay on top at full light. */
function OverlayPreview({
  image,
  overlay
}: {
  image: RgbaImage
  overlay: Uint8ClampedArray
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const height = Math.min(image.height, image.width)
    canvas.width = image.width
    canvas.height = height
    const night = new Uint8ClampedArray(image.width * height * 4)
    for (let i = 0; i < night.length; i += 4) {
      const a = overlay[i + 3]! / 255
      for (let c = 0; c < 3; c++) {
        const dark = image.data[i + c]! * 0.18
        night[i + c] = dark + (overlay[i + c]! - dark) * a
      }
      night[i + 3] = image.data[i + 3]!
    }
    context.putImageData(new ImageData(night, image.width, height), 0, 0)
  }, [image, overlay])
  return <canvas ref={ref} className="emissive-preview sunken" aria-hidden="true" />
}
