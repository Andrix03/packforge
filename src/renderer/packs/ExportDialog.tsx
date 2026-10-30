import { useEffect, useState } from 'react'
import { confirmAction } from '../ui/ask'
import {
  DEFAULT_PROJECT,
  LICENSES,
  validVersion,
  variantLabel,
  type ExportCheck,
  type ExportResult,
  type ExportVariant,
  type ListingResult,
  type ProjectInfo
} from '../../shared/exportPlan'
import { RESOLUTIONS } from '../../shared/resize'
import { DialogFrame, Glyph } from '../ui/components'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { tr } from '../../shared/i18n'

type Phase =
  | { status: 'setup' }
  | { status: 'working'; text: string }
  | {
      status: 'done'
      results: Array<{ variant: ExportVariant; result: ExportResult }>
      listing: ListingResult | null
    }

const today = (): string => new Date().toISOString().slice(0, 10)

/** Versioned zips of the pack (variants), with license, credits, changelog and a checklist. */
export function ExportDialog({
  onClose,
  embedded = false
}: {
  onClose: () => void
  /** Shown inside the Pubblica screen instead of as a dialog. */
  embedded?: boolean
}): React.JSX.Element {
  const [info, setInfo] = useState<ProjectInfo | null>(null)
  const [check, setCheck] = useState<ExportCheck | null>(null)
  const [checkRun, setCheckRun] = useState(0)
  const [dir, setDir] = useState<string | null>(null)
  const [full, setFull] = useState(true)
  const [base, setBase] = useState(false)
  const [resolution, setResolution] = useState<number | null>(null)
  const [withListing, setWithListing] = useState(true)
  const [phase, setPhase] = useState<Phase>({ status: 'setup' })
  useEscape(onClose, !embedded && phase.status !== 'working')

  useEffect(() => {
    let current = true
    void window.api.invoke('project:get').then((p) => current && setInfo(p))
    void window.api.invoke('export:defaultDir').then((d) => current && setDir((old) => old ?? d))
    return () => {
      current = false
    }
  }, [])

  useEffect(() => {
    let current = true
    void window.api.invoke('export:check').then((c) => current && setCheck(c))
    return () => {
      current = false
    }
  }, [checkRun])

  const project = info ?? DEFAULT_PROJECT
  const set = (change: Partial<ProjectInfo>): void => setInfo({ ...project, ...change })
  const notes = project.changelog.find((e) => e.version === project.version)?.notes ?? ''
  const setNotes = (value: string): void =>
    set({
      changelog: [
        ...project.changelog.filter((e) => e.version !== project.version),
        { version: project.version, date: today(), notes: value }
      ]
    })
  const variants: ExportVariant[] = [
    ...(full ? [{ kind: 'full' } as const] : []),
    ...(base ? [{ kind: 'no-pbr' } as const] : []),
    ...(resolution ? [{ kind: 'resolution', resolution } as const] : [])
  ]
  const versionOk = validVersion(project.version)
  const blocking = (check?.errors.length ?? 0) > 0

  const exportAll = useSingleFlight(async (): Promise<void> => {
    if (
      blocking &&
      !(await confirmAction(tr('Il controllo ha trovato errori (vedi sopra). Esportare comunque?')))
    ) {
      return
    }
    setPhase({ status: 'working', text: tr('Salvo il progetto…') })
    // The zip takes its version and changelog from the saved project: stop if it wasn't saved.
    const saved = await window.api.invoke('project:save', project)
    if (!saved.ok) {
      const error = tr(
        'Impossibile salvare versione e note del progetto: {0}',
        saved.error ?? tr('errore sconosciuto')
      )
      setPhase({
        status: 'done',
        results: variants.map((variant) => ({ variant, result: { ok: false, error } })),
        listing: null
      })
      return
    }
    const results: Array<{ variant: ExportVariant; result: ExportResult }> = []
    for (const variant of variants) {
      setPhase({ status: 'working', text: tr('Creo lo zip {0}…', variantLabel(variant)) })
      let result = await window.api.invoke('export:build', variant, dir, false)
      if (!result.ok && result.exists && (await confirmAction(`${result.error} Sovrascriverlo?`))) {
        result = await window.api.invoke('export:build', variant, dir, true)
      }
      results.push({ variant, result })
    }
    let listing: ListingResult | null = null
    if (withListing) {
      setPhase({ status: 'working', text: tr('Preparo la scheda per Modrinth / CurseForge…') })
      listing = await window.api.invoke('export:listing', dir)
    }
    setPhase({ status: 'done', results, listing })
  })

  if (phase.status !== 'setup') {
    return (
      <DialogFrame embedded={embedded} label={tr('Esporta')}>
        <h2>{tr('Esporta')}</h2>
        {phase.status === 'working' ? (
          <p className="small">{phase.text}</p>
        ) : (
          <>
            {phase.listing && (
              <p
                className={phase.listing.ok ? 'small' : 'field-error small'}
                data-testid="export-listing"
              >
                {phase.listing.ok
                  ? tr(
                      'Scheda per Modrinth / CurseForge: {0}{1}',
                      phase.listing.dir,
                      phase.listing.kept.length > 0
                        ? tr(
                            ' ({0} file già presenti lasciati com’erano)',
                            phase.listing.kept.length
                          )
                        : ''
                    )
                  : phase.listing.error}
              </p>
            )}
            <ul className="validator-issues" data-testid="export-results">
              {phase.results.map(({ variant, result }) => (
                <li
                  key={variantLabel(variant)}
                  className={`validator-issue ${result.ok ? 'info' : 'error'}`}
                >
                  <span className="validator-icon">
                    <Glyph name={result.ok ? 'check' : 'cross'} alone />
                  </span>
                  <div>
                    <strong>{variantLabel(variant)}</strong>
                    <p className="small">
                      {result.ok
                        ? `${result.path}, ${result.files} file, ${(result.bytes / 1024).toFixed(0)} KB${result.kept.length > 0 ? tr(', {0} texture lasciate alla loro risoluzione', result.kept.length) : ''}${result.saved >= 1024 ? tr(', PNG ottimizzati: {0} KB in meno', (result.saved / 1024).toFixed(0)) : ''}`
                        : result.error}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="row">
              {dir && (
                <button
                  type="button"
                  onClick={() => void window.api.invoke('export:openFolder', dir)}
                >
                  {tr('Apri la cartella')}
                </button>
              )}
              <button type="button" className="primary" onClick={onClose}>
                {tr('Chiudi')}
              </button>
            </div>
          </>
        )}
      </DialogFrame>
    )
  }

  return (
    <DialogFrame embedded={embedded} label={tr('Esporta')} onBackdrop={onClose}>
      <h2>{tr('Esporta il pack')}</h2>

      <h3 className="panel-title">{tr('1. Progetto')}</h3>
      <div className="export-grid">
        <label className="small">
          {tr('Versione')}
          <input
            aria-label={tr('Versione')}
            value={project.version}
            onChange={(event) => set({ version: event.target.value.trim() })}
          />
        </label>
        <label className="small">
          {tr('Autore')}
          <input
            aria-label={tr('Autore')}
            value={project.author}
            onChange={(event) => set({ author: event.target.value })}
          />
        </label>
        <label className="small">
          {tr('Licenza')}
          <select
            aria-label={tr('Licenza')}
            value={project.license}
            onChange={(event) => set({ license: event.target.value })}
          >
            {LICENSES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!versionOk && (
        <p className="field-error small">{tr('Versione non valida (es. 1.0.0, 2.1-beta).')}</p>
      )}
      <label className="small">
        {tr('Novità di questa versione (finiscono in CHANGELOG.md)')}
        <textarea
          aria-label={tr('Novità')}
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <CreditsEditor credits={project.credits} onChange={(credits) => set({ credits })} />

      <h3 className="panel-title">{tr('2. Controllo')}</h3>
      {!check ? (
        <p className="small">{tr('Controllo…')}</p>
      ) : (
        <div data-testid="export-check">
          {check.errors.map((e) => (
            <p key={e} className="field-error small">
              <Glyph name="cross" />
              {e}
            </p>
          ))}
          {check.vanillaCopies.length > 0 && (
            <p className="small muted">
              {check.vanillaCopies
                .slice(0, 10)
                .map((p) => p.split('/').pop())
                .join(', ')}
              {check.vanillaCopies.length > 10 ? '…' : ''}
            </p>
          )}
          {check.warnings.map((w) => (
            <p key={w} className="small">
              <Glyph name="warning" />
              {w}
            </p>
          ))}
          {check.stray.length > 0 && (
            <p className="small muted">
              {tr('Fuori dallo zip:')}{' '}
              {check.stray
                .slice(0, 8)
                .map((s) => `${s.path.split('/').pop()} (${s.reason})`)
                .join(', ')}
              {check.stray.length > 8 ? '…' : ''}
            </p>
          )}
          {check.errors.length === 0 && check.warnings.length === 0 && (
            <p className="small">
              <Glyph name="check" />
              {tr('Tutto a posto: {0} file.', check.files)}
            </p>
          )}
          <button type="button" className="small-button" onClick={() => setCheckRun((r) => r + 1)}>
            {tr('Ricontrolla')}
          </button>
        </div>
      )}

      <h3 className="panel-title">{tr('3. Varianti')}</h3>
      <label className="inline-check small">
        <input type="checkbox" checked={full} onChange={(event) => setFull(event.target.checked)} />
        {tr('Completo')}
      </label>
      <label className="inline-check small" title={tr('Senza _n e _s: per chi non usa shader')}>
        <input type="checkbox" checked={base} onChange={(event) => setBase(event.target.checked)} />
        {tr('Senza PBR (file «-base»)')}
      </label>
      <label
        className="inline-check small"
        title={tr(
          'Texture di blocchi, oggetti ed entità a un’altra risoluzione (pixel netti); le GUI restano com’erano'
        )}
      >
        <input
          type="checkbox"
          checked={resolution !== null}
          onChange={(event) => setResolution(event.target.checked ? 16 : null)}
        />
        {tr('Anche a')}
        <select
          aria-label={tr('Risoluzione export')}
          value={resolution ?? 16}
          disabled={resolution === null}
          onChange={(event) => setResolution(Number(event.target.value))}
        >
          {RESOLUTIONS.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </label>

      <label
        className="inline-check small"
        title={tr(
          'description-en.md, description-it.md e listing.txt con riassunto, versioni del gioco e tag consigliati'
        )}
      >
        <input
          type="checkbox"
          checked={withListing}
          onChange={(event) => setWithListing(event.target.checked)}
        />
        {tr('Prepara anche la scheda per Modrinth / CurseForge')}
      </label>

      <h3 className="panel-title">{tr('4. Destinazione')}</h3>
      <p className="small" data-testid="export-dir">
        {dir}
      </p>
      <div className="row">
        <button
          type="button"
          className="small-button"
          onClick={() =>
            void window.api
              .invoke('dialog:pickDirectory', 'exportDestination')
              .then((d) => d && setDir(d))
          }
        >
          {tr('Cambia…')}
        </button>
      </div>

      <details className="small export-rules">
        <summary>{tr('Pubblicare e guadagnare: cosa dicono le regole di Minecraft')}</summary>
        <p>
          {tr(
            'Dall’EULA di Minecraft: i contenuti che crei sono tuoi «purché tu non li venda / non cerchi di guadagnarci». Le donazioni sono ammesse se il donatore non riceve qualcosa che solo lui può usare: un pack riservato a chi paga (es. un livello Patreon) rischia di violarle. Gli export includono sempre in CREDITS.txt l’avvertenza «NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT». Non è un parere legale: in caso di dubbio leggi le linee guida su minecraft.net.'
          )}
        </p>
      </details>

      <div className="row">
        <button
          type="button"
          className="primary"
          disabled={variants.length === 0 || !versionOk || !info}
          onClick={() => exportAll()}
        >
          {tr('Esporta {0}', variants.length === 1 ? '1 zip' : `${variants.length} zip`)}
        </button>
        <button type="button" onClick={onClose}>
          {tr('Annulla')}
        </button>
      </div>
    </DialogFrame>
  )
}

function CreditsEditor({
  credits,
  onChange
}: {
  credits: ProjectInfo['credits']
  onChange: (credits: ProjectInfo['credits']) => void
}): React.JSX.Element {
  return (
    <div className="credits-editor">
      <span className="small">{tr('Crediti (CREDITS.txt)')}</span>
      {credits.map((credit, index) => (
        <div key={index} className="row">
          <input
            aria-label={tr('Nome {0}', index + 1)}
            placeholder={tr('Nome')}
            value={credit.name}
            onChange={(event) =>
              onChange(
                credits.map((c, i) => (i === index ? { ...c, name: event.target.value } : c))
              )
            }
          />
          <input
            aria-label={`Contributo ${index + 1}`}
            placeholder={tr('Cosa ha fatto (es. suoni, CC BY 4.0)')}
            value={credit.what}
            onChange={(event) =>
              onChange(
                credits.map((c, i) => (i === index ? { ...c, what: event.target.value } : c))
              )
            }
          />
          <button
            type="button"
            className="small-button"
            onClick={() => onChange(credits.filter((_, i) => i !== index))}
          >
            {tr('Togli')}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="small-button"
        onClick={() => onChange([...credits, { name: '', what: '' }])}
      >
        {tr('+ Credito')}
      </button>
    </div>
  )
}
