import { useEffect, useState } from 'react'
import { Button, Checkbox } from 'packforge-ui'
import { Glyph, PixelIcon } from '../ui/components'
import { NAV_ICONS } from '../ui/icons'
import type { SettingsUpdateResult } from '../../shared/ipc'
import { editorDisplayName, type SettingsView } from '../../shared/settings'
import { TUTORIAL_RESET_EVENT } from '../TutorialCard'
import { LANGUAGES, tr } from '../../shared/i18n'

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
        <p className="field-error">{tr('Impossibile leggere le impostazioni: {0}', loadError)}</p>
        <Button
          onClick={() => {
            setLoadError(null)
            setAttempt((a) => a + 1)
          }}
        >
          {tr('Riprova')}
        </Button>
      </section>
    )
  }
  if (!view) return <section className="card muted">{tr('Caricamento impostazioni…')}</section>

  const { settings, minecraft } = view
  const editor = settings.externalEditor
  const suggestions = view.detectedEditors.filter((e) => e.path !== editor)

  return (
    <section className="card form settings">
      <div className="row spread">
        <h2>{tr('Impostazioni')}</h2>
        <Button variant="main" onClick={() => onClose(changed)}>
          {tr('Fatto')}
        </Button>
      </div>
      {error && <p className="field-error">{error}</p>}

      <div className="field">
        <h3>{tr('Cartella .minecraft')}</h3>
        <div className="row">
          <code className="path" title={view.effectiveMinecraftDir}>
            {view.effectiveMinecraftDir}
          </code>
          {settings.minecraftDir === null && <span className="badge">{tr('predefinita')}</span>}
        </div>
        <MinecraftStatus status={minecraft} />
        <div className="row">
          <Button onClick={() => void pickMinecraftDir()} disabled={busy}>
            {tr('Cambia…')}
          </Button>
          {settings.minecraftDir !== null && (
            <Button
              onClick={() => void apply(window.api.invoke('settings:setMinecraftDir', null))}
              disabled={busy}
            >
              {tr('Ripristina predefinita')}
            </Button>
          )}
        </div>
        <p className="muted small">
          {tr(
            'Usata per le texture vanilla di riferimento e, più avanti, per copiare il pack in resourcepacks.'
          )}
        </p>
      </div>

      <div className="field">
        <h3>{tr('Editor esterno')}</h3>
        {editor ? (
          <div className="row">
            <strong>{editorDisplayName(editor)}</strong>
            <code className="path" title={editor}>
              {editor}
            </code>
          </div>
        ) : (
          <p className="muted">{tr('Nessun editor impostato.')}</p>
        )}
        {editor && !view.externalEditorExists && (
          <p className="field-error">{tr('Il programma non esiste più in questo percorso.')}</p>
        )}
        <div className="row">
          <Button onClick={() => void pickEditor()} disabled={busy}>
            {editor ? tr('Cambia…') : tr('Scegli…')}
          </Button>
          {editor && (
            <Button
              onClick={() => void apply(window.api.invoke('settings:setExternalEditor', null))}
              disabled={busy}
            >
              {tr('Rimuovi')}
            </Button>
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="suggestions">
            <span className="muted small">{tr('Trovati su questo PC:')}</span>
            {suggestions.map((candidate) => (
              <Button
                key={candidate.path}

                title={candidate.path}
                disabled={busy}
                onClick={() =>
                  void apply(window.api.invoke('settings:setExternalEditor', candidate.path))
                }
              >
                {tr('Usa {0}', candidate.name)}
              </Button>
            ))}
          </div>
        )}
        <p className="muted small">
          {tr(
            'Usato dal pulsante «Apri fuori» dell’editor (Aseprite, Photoshop, …): quando lì salvi, PackForge ricarica la texture da solo. Senza un programma scelto si apre quello predefinito del sistema.'
          )}
        </p>
      </div>

      <div className="field">
        <h3>{tr('Tutorial')}</h3>
        <p className="muted small">
          {tr(
            '«Il tuo primo blocco»: sei passi guidati, in modalità Principiante (stato: {0}).',
            view.settings.tutorial.status === 'done'
              ? tr('completato')
              : view.settings.tutorial.status === 'off'
                ? tr('nascosto')
                : `${view.settings.tutorial.done.length}/6`
          )}
        </p>
        <div className="row">
          <Button
            onClick={() =>
              void apply(
                window.api.invoke('settings:setTutorial', { status: 'active', done: [] })
              ).then(() => window.dispatchEvent(new Event(TUTORIAL_RESET_EVENT)))
            }
          >
            {tr('Rifai il tutorial')}
          </Button>
        </div>
      </div>

      <div className="field">
        <h3>{tr('Lingua')}</h3>
        <div className="row" role="radiogroup" aria-label={tr('Lingua')}>
          {LANGUAGES.map((option) => {
            const chosen = (view.settings.language ?? view.language) === option.id
            return (
              <Button
                key={option.id}

                role="radio"
                aria-checked={chosen}
                data-language={option.id}
                variant={chosen ? 'main' : 'normal'}
                onClick={() => void apply(window.api.invoke('settings:setLanguage', option.id))}
              >
                {option.label}
              </Button>
            )
          })}
        </div>
        {(view.settings.language ?? view.language) !== view.language && (
          <p className="small">
            {tr('La nuova lingua si usa dal prossimo avvio.')}{' '}
            <Button variant="quiet" onClick={() => void window.api.invoke('app:restart')}>
              {tr('Riavvia ora')}
            </Button>
          </p>
        )}
      </div>

      <div className="field">
        <h3>{tr('Aggiornamenti')}</h3>
        <Checkbox
          checked={view.settings.checkUpdates}
          onCheckedChange={(checked) =>
            void apply(window.api.invoke('settings:setCheckUpdates', checked))
          }
          label={tr('All’avvio controlla se c’è una nuova versione di PackForge')}
        />
        <p className="muted small">
          {tr(
            'Chiede a GitHub qual è l’ultima versione pubblicata; se è più nuova compare un avviso con il link per scaricarla. Non installa niente da solo.'
          )}
        </p>
      </div>
      {/* The notice the Minecraft usage guidelines ask for, as a pixel box (canvas: Impostazioni). */}
      <div className="official-notice" data-testid="official-notice">
        <div className="official-notice-box">
          <PixelIcon icon={NAV_ICONS.logo} size={32} />
          <span>
            <span className="lbl official-name">
              {tr('PackForge')} {version ?? ''}
            </span>
            <span className="official-warn">{tr('Non è un prodotto ufficiale di Minecraft.')}</span>
            <span className="muted">{tr('Non approvato né associato a Mojang o Microsoft.')}</span>
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
      <p className="field-error">
        {tr('La cartella non esiste: avvia Minecraft una volta dal launcher.')}
      </p>
    )
  }
  return (
    <ul className="status-list">
      <li className={status.versionCount > 0 ? 'ok' : 'warn'}>
        <Glyph name={status.versionCount > 0 ? 'check' : 'warning'} />
        {status.versionCount > 0
          ? tr(
              '{0} {1} con jar del client',
              status.versionCount,
              status.versionCount === 1 ? tr('versione installata') : tr('versioni installate')
            )
          : tr('Nessuna versione con jar del client: avvia una versione dal launcher.')}
      </li>
      <li className={status.hasResourcepacks ? 'ok' : 'warn'}>
        <Glyph name={status.hasResourcepacks ? 'check' : 'warning'} />
        {status.hasResourcepacks
          ? tr('Cartella resourcepacks presente')
          : tr('Cartella resourcepacks assente (Minecraft la crea al primo avvio)')}
      </li>
    </ul>
  )
}
