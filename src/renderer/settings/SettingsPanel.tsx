import { useEffect, useState } from 'react'
import type { SettingsUpdateResult } from '../../shared/ipc'
import { editorDisplayName, type SettingsView } from '../../shared/settings'

interface SettingsPanelProps {
  /** `changed` is true when something was saved, so callers can refresh. */
  onClose: (changed: boolean) => void
}

export function SettingsPanel({ onClose }: SettingsPanelProps): React.JSX.Element {
  const [view, setView] = useState<SettingsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [changed, setChanged] = useState(false)

  useEffect(() => {
    void window.api.invoke('settings:get').then(setView)
  }, [])

  async function apply(request: Promise<SettingsUpdateResult>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const result = await request
      if (result.ok) {
        setView(result.view)
        setChanged(true)
      } else {
        setError(result.error)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  async function pickMinecraftDir(): Promise<void> {
    const path = await window.api.invoke('dialog:pickDirectory', 'minecraftDir')
    if (path) await apply(window.api.invoke('settings:setMinecraftDir', path))
  }

  async function pickEditor(): Promise<void> {
    const path = await window.api.invoke('dialog:pickExecutable')
    if (path) await apply(window.api.invoke('settings:setExternalEditor', path))
  }

  if (!view) return <section className="card muted">Caricamento impostazioni…</section>

  const { settings, minecraft } = view
  const editor = settings.externalEditor
  const suggestions = view.detectedEditors.filter((e) => e.path !== editor)

  return (
    <section className="card form settings">
      <div className="row spread">
        <h2>Impostazioni</h2>
        <button type="button" onClick={() => onClose(changed)}>
          Fatto
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}

      <div className="field">
        <h3>Cartella .minecraft</h3>
        <div className="row">
          <code className="path" title={view.effectiveMinecraftDir}>
            {view.effectiveMinecraftDir}
          </code>
          {settings.minecraftDir === null && <span className="badge">predefinita</span>}
        </div>
        <MinecraftStatus status={minecraft} />
        <div className="row">
          <button type="button" onClick={() => void pickMinecraftDir()} disabled={busy}>
            Cambia…
          </button>
          {settings.minecraftDir !== null && (
            <button
              type="button"
              onClick={() => void apply(window.api.invoke('settings:setMinecraftDir', null))}
              disabled={busy}
            >
              Ripristina predefinita
            </button>
          )}
        </div>
        <p className="muted small">
          Usata per le texture vanilla di riferimento e, più avanti, per copiare il pack in
          resourcepacks.
        </p>
      </div>

      <div className="field">
        <h3>Editor esterno</h3>
        {editor ? (
          <div className="row">
            <strong>{editorDisplayName(editor)}</strong>
            <code className="path" title={editor}>
              {editor}
            </code>
          </div>
        ) : (
          <p className="muted">Nessun editor impostato.</p>
        )}
        {editor && !view.externalEditorExists && (
          <p className="field-error">Il programma non esiste più in questo percorso.</p>
        )}
        <div className="row">
          <button type="button" onClick={() => void pickEditor()} disabled={busy}>
            {editor ? 'Cambia…' : 'Scegli…'}
          </button>
          {editor && (
            <button
              type="button"
              onClick={() => void apply(window.api.invoke('settings:setExternalEditor', null))}
              disabled={busy}
            >
              Rimuovi
            </button>
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="suggestions">
            <span className="muted small">Trovati su questo PC:</span>
            {suggestions.map((candidate) => (
              <button
                key={candidate.path}
                type="button"
                title={candidate.path}
                disabled={busy}
                onClick={() =>
                  void apply(window.api.invoke('settings:setExternalEditor', candidate.path))
                }
              >
                Usa {candidate.name}
              </button>
            ))}
          </div>
        )}
        <p className="muted small">
          Usato dal pulsante «✎» dell’editor (Aseprite, Photoshop, …): quando lì salvi, PackForge
          ricarica la texture da solo. Senza un programma scelto si apre quello predefinito di
          Windows.
        </p>
      </div>

      <div className="field">
        <h3>Aggiornamenti</h3>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={view.settings.checkUpdates}
            onChange={(event) =>
              void apply(window.api.invoke('settings:setCheckUpdates', event.target.checked))
            }
          />
          All’avvio controlla se c’è una nuova versione di PackForge
        </label>
        <p className="muted small">
          Chiede a GitHub qual è l’ultima versione pubblicata; se è più nuova compare un avviso con
          il link per scaricarla. Non installa niente da solo.
        </p>
      </div>
    </section>
  )
}

function MinecraftStatus({ status }: { status: SettingsView['minecraft'] }): React.JSX.Element {
  if (!status.exists) {
    return (
      <p className="field-error">La cartella non esiste: avvia Minecraft una volta dal launcher.</p>
    )
  }
  return (
    <ul className="status-list">
      <li className={status.versionCount > 0 ? 'ok' : 'warn'}>
        {status.versionCount > 0
          ? `${status.versionCount} ${status.versionCount === 1 ? 'versione installata' : 'versioni installate'} con jar del client`
          : 'Nessuna versione con jar del client: avvia una versione dal launcher.'}
      </li>
      <li className={status.hasResourcepacks ? 'ok' : 'warn'}>
        {status.hasResourcepacks
          ? 'Cartella resourcepacks presente'
          : 'Cartella resourcepacks assente (Minecraft la crea al primo avvio)'}
      </li>
    </ul>
  )
}
