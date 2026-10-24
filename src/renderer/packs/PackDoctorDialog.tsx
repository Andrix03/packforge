import { useEffect, useMemo, useState } from 'react'
import { tr } from '../../shared/i18n'
import type { VanillaVersionInfo } from '../../shared/ipc'
import {
  brokenReferences,
  diffTextures,
  lintPaths,
  missingTextures,
  renamePlan,
  type PathIssue,
  type TextureDiff
} from '../../shared/packDoctor'
import { backupBefore } from './backup'
import { errorMessage, fetchText } from './packFetch'
import type { AssetSources } from '../preview/modelSource'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { Glyph } from '../ui/components'
import { NAV_ICONS } from '../ui/icons'

type Tab = 'problems' | 'missing' | 'porting'

const JSON_FILE = /^assets\/[^/]+\/(models|blockstates|items)\/.+\.json$/

/**
 * Pack Doctor: what the game silently ignores or draws purple and black, which game textures the
 * pack doesn't replace yet, and porting across versions (textures the newer one renamed are
 * moved, the ones it removed are listed). Reads the pack and the user's installed game only.
 */
export function PackDoctorDialog({
  sources,
  versionId,
  canWrite,
  onClose
}: {
  sources: AssetSources
  /** The game version used as reference (its textures are the "missing" list). */
  versionId: string | null
  canWrite: boolean
  onClose: () => void
}): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('problems')
  const [busy, setBusy] = useState(false)
  useEscape(onClose, !busy)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal form doctor-dialog"
        role="dialog"
        aria-label={tr('Diagnosi del pack')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>
          <Glyph icon={NAV_ICONS.search} />
          {tr('Diagnosi del pack')}
        </h2>
        <div className="tabs small-tabs" role="tablist">
          {(
            [
              ['problems', tr('Problemi')],
              ['missing', tr('Cosa manca')],
              ['porting', tr('Cambio di versione')]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'tab active' : 'tab'}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'problems' && <Problems sources={sources} />}
        {tab === 'missing' && <Missing sources={sources} versionId={versionId} />}
        {tab === 'porting' && <Porting sources={sources} canWrite={canWrite} onBusy={setBusy} />}
        <div className="row">
          <button type="button" onClick={onClose} disabled={busy}>
            {tr('Chiudi')}
          </button>
        </div>
      </div>
    </div>
  )
}

function IssueList({ issues, testId }: { issues: PathIssue[]; testId: string }): React.JSX.Element {
  return (
    <ul className="doctor-list" data-testid={testId}>
      {issues.map((issue, i) => (
        <li key={`${issue.path}-${i}`}>
          <code>{issue.path}</code>
          <br />
          <span className="small">{issue.message}</span>
        </li>
      ))}
    </ul>
  )
}

function Problems({ sources }: { sources: AssetSources }): React.JSX.Element {
  const [references, setReferences] = useState<PathIssue[] | null>(null)
  const names = useMemo(() => lintPaths(sources.pack.files), [sources.pack.files])
  useEffect(() => {
    if (!sources.vanilla) return
    let current = true
    void (async () => {
      const files = new Map<string, unknown>()
      for (const path of sources.pack.files) {
        if (!JSON_FILE.test(path)) continue
        try {
          files.set(path, JSON.parse(await fetchText(sources.pack, path)) as unknown)
        } catch {
          files.set(path, null)
        }
      }
      const vanilla = sources.vanilla
      const exists = (path: string): boolean =>
        sources.pack.files.has(path) || (vanilla?.files.has(path) ?? false)
      if (current) setReferences(brokenReferences(files, exists))
    })()
    return () => {
      current = false
    }
  }, [sources])

  const total = names.length + (references?.length ?? 0)
  return (
    <div className="doctor-body">
      <p className="muted small">
        {tr(
          'File che il gioco salta senza dirlo, e modelli che puntano a file che non esistono (in gioco: viola e nero).'
        )}
      </p>
      {!sources.vanilla && (
        <p className="small">
          <Glyph name="warning" />
          {tr('Senza il gioco installato non controllo i riferimenti ai file di vanilla.')}
        </p>
      )}
      {sources.vanilla && references === null ? (
        <p className="muted">{tr('Leggo modelli, stati e oggetti del pack…')}</p>
      ) : total === 0 ? (
        <p className="small ok-text" data-testid="doctor-clean">
          <Glyph name="check" />
          {tr('Nessun problema trovato.')}
        </p>
      ) : (
        <IssueList issues={[...names, ...(references ?? [])]} testId="doctor-problems" />
      )}
    </div>
  )
}

function Missing({
  sources,
  versionId
}: {
  sources: AssetSources
  versionId: string | null
}): React.JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const groups = useMemo(
    () =>
      sources.vanilla
        ? [...missingTextures(sources.vanilla.files, sources.pack.files)].sort(
            (a, b) => b[1].length - a[1].length
          )
        : [],
    [sources]
  )
  if (!sources.vanilla) {
    return (
      <p className="small doctor-body">
        {tr('Serve il gioco installato: scegli la versione di riferimento nella scheda Vanilla.')}
      </p>
    )
  }
  return (
    <div className="doctor-body">
      <p className="muted small">
        {tr('Texture della {0} che il pack non sostituisce, per cartella.', versionId ?? '?')}
      </p>
      <ul className="doctor-groups" data-testid="doctor-missing">
        {groups.map(([folder, paths]) => (
          <li key={folder}>
            <button
              type="button"
              className="small-button"
              aria-expanded={open === folder}
              onClick={() => setOpen(open === folder ? null : folder)}
            >
              {folder} <b>{paths.length}</b>
            </button>
            {open === folder && (
              <ul className="doctor-list">
                {paths.slice(0, 300).map((path) => (
                  <li key={path}>
                    <code>{path.replace(/^assets\/minecraft\/textures\//, '')}</code>
                  </li>
                ))}
                {paths.length > 300 && (
                  <li className="muted small">{tr('…e altre {0}.', paths.length - 300)}</li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Porting({
  sources,
  canWrite,
  onBusy
}: {
  sources: AssetSources
  canWrite: boolean
  onBusy: (busy: boolean) => void
}): React.JSX.Element {
  const [versions, setVersions] = useState<VanillaVersionInfo[] | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [diff, setDiff] = useState<TextureDiff | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void window.api.invoke('vanilla:listVersions').then((listed) => {
      if (!current) return
      const list = listed.ok ? listed.versions : []
      setVersions(list)
    })
    return () => {
      current = false
    }
  }, [])
  const fromId = from || versions?.[1]?.id || ''
  const toId = to || versions?.[0]?.id || ''

  const compare = useSingleFlight(async (): Promise<void> => {
    setError(null)
    setDiff(null)
    onBusy(true)
    setStatus(tr('Leggo le texture delle due versioni…'))
    try {
      const [before, after] = await Promise.all([
        window.api.invoke('vanilla:textureHashes', fromId),
        window.api.invoke('vanilla:textureHashes', toId)
      ])
      if (!before.ok) throw new Error(before.error)
      if (!after.ok) throw new Error(after.error)
      setDiff(
        diffTextures(new Map(Object.entries(before.hashes)), new Map(Object.entries(after.hashes)))
      )
    } catch (e) {
      setError(errorMessage(e))
    }
    setStatus(null)
    onBusy(false)
  })

  const plan = diff ? renamePlan(sources.pack.files, diff.renamed) : null
  const stale = diff ? diff.removed.filter((path) => sources.pack.files.has(path)) : []

  const move = useSingleFlight(async (): Promise<void> => {
    if (!plan || plan.steps.length === 0) return
    if (
      !(await backupBefore(
        tr('Porting da {0} a {1}', fromId, toId),
        plan.steps.map((s) => s.from)
      ))
    )
      return
    onBusy(true)
    let moved = 0
    const errors: string[] = []
    for (const step of plan.steps) {
      const result = await window.api.invoke('pack:moveFile', step.from, step.to)
      if (result.ok) moved++
      else errors.push(result.error)
    }
    onBusy(false)
    setStatus(tr('{0} file spostati.', moved))
    if (errors.length > 0) setError(errors.join('\n'))
  })

  return (
    <div className="doctor-body">
      <p className="muted small">
        {tr(
          'Confronta le texture di due versioni installate: quelle rinominate si portano nel pack con un clic (con mappe e .mcmeta), quelle tolte e quelle nuove sono elencate.'
        )}
      </p>
      {versions === null ? (
        <p className="muted">{tr('Cerco le versioni installate…')}</p>
      ) : versions.length < 2 ? (
        <p className="small">{tr('Servono almeno due versioni installate nel launcher.')}</p>
      ) : (
        <div className="row wrap">
          <label className="small select-field">
            {tr('Da')}{' '}
            <select
              value={fromId}
              aria-label={tr('Versione di partenza')}
              onChange={(e) => setFrom(e.target.value)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </label>
          <label className="small select-field">
            {tr('A')}{' '}
            <select
              value={toId}
              aria-label={tr('Versione di arrivo')}
              onChange={(e) => setTo(e.target.value)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary"
            disabled={fromId === toId || status !== null}
            onClick={() => compare()}
          >
            {tr('Confronta')}
          </button>
        </div>
      )}
      {status && <p className="muted small">{status}</p>}
      {error && <p className="field-error small">{error}</p>}
      {diff && plan && (
        <div data-testid="doctor-diff">
          <p className="small">
            {tr(
              'Rinominate {0}, tolte {1}, nuove {2}, ridisegnate {3}.',
              diff.renamed.length,
              diff.removed.length,
              diff.added.length,
              diff.changed.length
            )}
          </p>
          {plan.steps.length > 0 ? (
            <>
              <p className="small">{tr('File del pack da spostare:')}</p>
              <ul className="doctor-list">
                {plan.steps.map((step) => (
                  <li key={step.from}>
                    <code>{step.from}</code>
                    <br />
                    <span className="small">{tr('diventa {0}', step.to)}</span>
                  </li>
                ))}
              </ul>
              {canWrite && (
                <button type="button" className="primary" onClick={() => move()}>
                  {tr('Sposta {0} file', plan.steps.length)}
                </button>
              )}
            </>
          ) : (
            <p className="small ok-text">{tr('Nessun file del pack da rinominare.')}</p>
          )}
          {plan.blocked.length > 0 && (
            <p className="small">
              <Glyph name="warning" />
              {tr('{0} file non spostati: il nome nuovo esiste già nel pack.', plan.blocked.length)}
            </p>
          )}
          {stale.length > 0 && (
            <>
              <p className="small">{tr('Texture del pack che la nuova versione non usa più:')}</p>
              <IssueList
                issues={stale.map((path) => ({ path, message: tr('Tolta dal gioco.') }))}
                testId="doctor-stale"
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}
