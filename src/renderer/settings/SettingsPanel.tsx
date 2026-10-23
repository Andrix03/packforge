import { useEffect, useState } from 'react'
import { PixelIcon } from '../ui/components'
import { NAV_ICONS } from '../ui/icons'
import type { SettingsUpdateResult } from '../../shared/ipc'
import { editorDisplayName, type SettingsView } from '../../shared/settings'
import { TUTORIAL_RESET_EVENT } from '../TutorialCard'

interface SettingsPanelProps {
  /** `changed` is true when something was saved, so callers can refresh. */
  onClose: (changed: boolean) => void
  /** PackForge version shown in the notice box. */
  version?: string | undefined
}

export function SettingsPanel({ onClose, version }: SettingsPanelProps): React.JSX.Element {
  const [view, setView] = useState<SettingsView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [changed, setChanged] = useState(false)

  /** Bumped by "Riprova" after the settings could not be read. */
  const [attempt, setAttempt] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    window.api.invoke('settings:get').then(
      (next) => current && setView(next),
      (failure: unknown) =>
        current && setLoadError(failure instanceof Error ? failure.message : String(failure))
    )
    return () => {
      current = false
    }
  }, [attempt])

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

  if (!view && loadError) {
    return (
      <section className="card">
        <p className="field-error">Impossibile leggere le impostazioni: {loadError}</p>
        <button
          type="button"
          onClick={() => {
            setLoadError(null)
            setAttempt((a) => a + 1)
          }}
        >
          Riprova
        </button>
      </section>
    )
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
        <h3>Tutorial</h3>
        <p className="muted small">
          «Il tuo primo blocco»: sei passi guidati, in modalità Principiante (stato:{' '}
          {view.settings.tutorial.status === 'done'
            ? 'completato'
            : view.settings.tutorial.status === 'off'
              ? 'nascosto'
              : `${view.settings.tutorial.done.length}/6`}
          ).
        </p>
        <button
          type="button"
          className="small-button"
          onClick={() =>
            void apply(
              window.api.invoke('settings:setTutorial', { status: 'active', done: [] })
            ).then(() => window.dispatchEvent(new Event(TUTORIAL_RESET_EVENT)))
          }
        >
          Rifai il tutorial
        </button>
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
      {/* The notice the Minecraft usage guidelines ask for, as a pixel box (canvas: Impostazioni). */}
      <div className="official-notice" data-testid="official-notice">
        <div className="official-notice-box">
          <PixelIcon icon={NAV_ICONS.logo} size={32} />
          <span>
            <span className="lbl official-name">PackForge {version ?? ''}</span>
            <span className="official-warn">Non è un prodotto ufficiale di Minecraft.</span>
            <span className="muted">Non approvato né associato a Mojang o Microsoft.</span>
          </span>
        </div>
        <span className="official-underline" aria-hidden="true" />
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
