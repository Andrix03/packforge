import { useState } from 'react'
import type { PackSummary } from '../../shared/ipc'
import { compatibleReleases, isOverlayActive } from '../../shared/mcmeta'
import {
  comparePackVersions,
  findRelease,
  formatPackVersion,
  GAME_RELEASES,
  LATEST_RELEASE,
  MODERN_FORMAT_MIN_MAJOR
} from '../../shared/packFormat'
import {
  buildOverlayEntries,
  formatFieldsForRange,
  releaseSpan,
  validateOverlayDirectory,
  type OverlaySpec
} from '../../shared/versionRange'

interface OverlayDraft {
  /** Stable React key; directory names can be edited. */
  id: number
  directory: string
  minVersion: string
  maxVersion: string
}

interface VersionEditorProps {
  pack: PackSummary
  onCancel: () => void
  onSaved: (pack: PackSummary) => void
}

let nextOverlayId = 1

export function VersionEditor({ pack, onCancel, onSaved }: VersionEditorProps): React.JSX.Element {
  const initial = releaseSpan(compatibleReleases(pack.mcmeta.formats)) ?? {
    minVersion: LATEST_RELEASE.version,
    maxVersion: LATEST_RELEASE.version
  }
  const [minVersion, setMinVersion] = useState(initial.minVersion)
  const [maxVersion, setMaxVersion] = useState(initial.maxVersion)
  const [overlays, setOverlays] = useState<OverlayDraft[]>(() =>
    pack.mcmeta.overlays.map((overlay) => ({
      id: nextOverlayId++,
      directory: overlay.directory,
      ...(releaseSpan(GAME_RELEASES.filter((r) => isOverlayActive(overlay, r))) ?? {
        minVersion: initial.minVersion,
        maxVersion: initial.maxVersion
      })
    }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const problems = validate(minVersion, maxVersion, overlays)
  const preview = previewMcmeta(minVersion, maxVersion, overlays)
  const removed = pack.mcmeta.overlays.filter(
    (o) => !overlays.some((draft) => draft.directory === o.directory)
  )

  function updateOverlay(id: number, change: Partial<OverlayDraft>): void {
    setOverlays((list) => list.map((o) => (o.id === id ? { ...o, ...change } : o)))
  }

  async function save(): Promise<void> {
    setSaving(true)
    setError(null)
    const result = await window.api.invoke('pack:updateVersions', {
      minVersion,
      maxVersion,
      overlays: overlays.map(({ directory, minVersion: min, maxVersion: max }) => ({
        directory,
        minVersion: min,
        maxVersion: max
      }))
    })
    setSaving(false)
    if (result.ok) onSaved(result.pack)
    else setError(result.error)
  }

  return (
    <div className="version-editor">
      <div className="row wrap">
        <span>Versioni supportate da</span>
        <VersionSelect value={minVersion} onChange={setMinVersion} />
        <span>a</span>
        <VersionSelect value={maxVersion} onChange={setMaxVersion} />
      </div>

      <div className="overlay-list">
        <div className="row spread">
          <h3>Overlay</h3>
          <button
            type="button"
            onClick={() =>
              setOverlays((list) => [
                ...list,
                { id: nextOverlayId++, directory: '', minVersion, maxVersion }
              ])
            }
          >
            Aggiungi overlay
          </button>
        </div>
        <p className="muted small">
          Un overlay è una cartella con file che sostituiscono quelli del pack solo nelle versioni
          indicate (dalla 1.20.2 in poi). L'ordine conta: il primo viene applicato per primo.
        </p>
        {overlays.map((overlay) => (
          <div key={overlay.id} className="row wrap overlay-row">
            <input
              value={overlay.directory}
              onChange={(event) => updateOverlay(overlay.id, { directory: event.target.value })}
              placeholder="nome_cartella"
              aria-label="Cartella overlay"
              aria-invalid={validateOverlayDirectory(overlay.directory) !== null}
            />
            <VersionSelect
              value={overlay.minVersion}
              onChange={(value) => updateOverlay(overlay.id, { minVersion: value })}
            />
            <span>→</span>
            <VersionSelect
              value={overlay.maxVersion}
              onChange={(value) => updateOverlay(overlay.id, { maxVersion: value })}
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => setOverlays((list) => list.filter((o) => o.id !== overlay.id))}
              aria-label={`Rimuovi overlay ${overlay.directory}`}
              title="Rimuovi dall'elenco (la cartella sul disco non viene cancellata)"
            >
              ×
            </button>
          </div>
        ))}
        {removed.length > 0 && (
          <p className="muted small">
            Rimossi dall'elenco: {removed.map((o) => o.directory).join(', ')}. Le cartelle restano
            sul disco.
          </p>
        )}
      </div>

      <details>
        <summary>Anteprima dei campi in pack.mcmeta</summary>
        <pre>{preview}</pre>
      </details>

      {modernOnlyOverlaysInLegacyPack(minVersion, overlays) && (
        <p className="warning-text small">
          Il pack supporta versioni precedenti alla 1.21.9, ma nessun overlay le copre: come da
          regole di 25w31a, gli overlay non avranno il campo "formats". Prima della 1.21.9 quel
          campo era obbligatorio, quindi verifica in gioco che il pack si carichi anche nelle
          versioni vecchie.
        </p>
      )}
      {problems.map((problem) => (
        <span key={problem} className="field-error">
          {problem}
        </span>
      ))}
      {error && <span className="field-error">{error}</span>}
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => void save()}
          disabled={saving || problems.length > 0}
        >
          {saving ? 'Salvataggio…' : 'Salva in pack.mcmeta'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>
          Annulla
        </button>
      </div>
    </div>
  )
}

function VersionSelect({
  value,
  onChange
}: {
  value: string
  onChange: (value: string) => void
}): React.JSX.Element {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {GAME_RELEASES.map((r) => (
        <option key={r.version} value={r.version}>
          {r.version} ({formatPackVersion(r.resourceFormat)})
        </option>
      ))}
    </select>
  )
}

function validate(min: string, max: string, overlays: OverlayDraft[]): string[] {
  const problems: string[] = []
  if (isReversed(min, max)) problems.push('La versione minima è più recente della massima.')
  const seen = new Set<string>()
  for (const overlay of overlays) {
    const invalid = validateOverlayDirectory(overlay.directory)
    if (invalid) problems.push(invalid)
    else if (seen.has(overlay.directory)) {
      problems.push(`La cartella overlay "${overlay.directory}" è ripetuta.`)
    }
    seen.add(overlay.directory)
    if (isReversed(overlay.minVersion, overlay.maxVersion)) {
      problems.push(`Overlay "${overlay.directory || '?'}": la versione minima è dopo la massima.`)
    }
  }
  return [...new Set(problems)]
}

/**
 * Pack reaches below format 65 but every overlay is modern-only: per 25w31a the
 * overlays get no `formats`, which 1.20.2 – 1.21.8 required. Unverified in game.
 */
function modernOnlyOverlaysInLegacyPack(minVersion: string, overlays: OverlayDraft[]): boolean {
  const packMin = findRelease(minVersion)?.resourceFormat.major
  if (packMin === undefined || packMin >= MODERN_FORMAT_MIN_MAJOR || overlays.length === 0) {
    return false
  }
  return overlays.every(
    (o) => (findRelease(o.minVersion)?.resourceFormat.major ?? 0) >= MODERN_FORMAT_MIN_MAJOR
  )
}

function isReversed(min: string, max: string): boolean {
  const a = findRelease(min)
  const b = findRelease(max)
  return !a || !b || comparePackVersions(a.resourceFormat, b.resourceFormat) > 0
}

/** Shows what will be written, mirroring main's logic. */
function previewMcmeta(min: string, max: string, overlays: OverlayDraft[]): string {
  const a = findRelease(min)
  const b = findRelease(max)
  if (!a || !b || isReversed(min, max)) return '—'
  const result: Record<string, unknown> = {
    pack: formatFieldsForRange(a.resourceFormat, b.resourceFormat)
  }
  const specs: OverlaySpec[] = []
  for (const overlay of overlays) {
    const oMin = findRelease(overlay.minVersion)
    const oMax = findRelease(overlay.maxVersion)
    if (oMin && oMax) {
      specs.push({
        directory: overlay.directory,
        min: oMin.resourceFormat,
        max: oMax.resourceFormat
      })
    }
  }
  if (specs.length > 0) result['overlays'] = { entries: buildOverlayEntries(specs) }
  return JSON.stringify(result, null, 2)
}
