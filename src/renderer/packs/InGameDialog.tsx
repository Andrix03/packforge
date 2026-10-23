import { useEffect, useState } from 'react'
import type { SyncStatus } from '../../shared/ipc'
import { announceStep } from '../tutorialEvents'
import { DialogFrame, Glyph } from '../ui/components'
import { useEscape } from '../useEscape'
import { locale, tr } from '../../shared/i18n'

/** Debug hotkeys useful while testing a pack (minecraft.wiki "Debug hotkey", 26.x). */
const HOTKEYS: ReadonlyArray<[string, string]> = [
  [
    'F3 + T',
    tr('Ricarica i resource pack (texture, modelli, suoni): da premere dopo ogni modifica')
  ],
  ['F3 + A', tr('Ricarica i chunk caricati')],
  ['F3 + G', tr('Mostra i confini dei chunk')],
  ['F3 + B', tr('Mostra le hitbox delle entità')],
  ['F3 + H', tr('Tooltip avanzati degli oggetti (id, durabilità)')],
  ['F3 + Esc', tr('Pausa senza menu (solo giocatore singolo): utile per guardare da vicino')],
  ['F3 + F4', tr('Cambia modalità di gioco')],
  ['F3 + N', tr('Passa a spettatore e ritorno')]
]

/** Iris defaults (Iris guide; they can be changed in Controlli). */
const IRIS_KEYS: ReadonlyArray<[string, string]> = [
  ['R', tr('Ricarica lo shader pack (dopo aver cambiato _n / _s basta F3 + T)')],
  ['K', tr('Attiva / disattiva gli shader: confronto immediato con e senza')],
  ['O', tr('Menu degli shader pack, con lo sfondo trasparente')]
]

/** Test the pack in the game: its copy in resourcepacks and the keys to remember. */
export function InGameDialog({
  packName,
  onClose,
  embedded = false
}: {
  packName: string
  onClose: () => void
  /** Shown inside the Pubblica screen instead of as a dialog. */
  embedded?: boolean
}): React.JSX.Element {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  useEscape(onClose, !embedded)

  useEffect(() => {
    let current = true
    void window.api.invoke('sync:status').then((s) => current && setStatus(s))
    const off = window.api.on('sync:changed', (s) => current && setStatus(s))
    return () => {
      current = false
      off()
    }
  }, [])

  async function copyNow(): Promise<void> {
    setBusy(true)
    const result = await window.api.invoke('sync:now')
    setStatus(result)
    if (result.last && !result.last.error) announceStep('game')
    setBusy(false)
  }

  const last = status?.last
  return (
    <DialogFrame embedded={embedded} label={tr('Prova in gioco')} onBackdrop={onClose}>
      <h2>{tr('Prova {0} in gioco', packName)}</h2>

      <h3 className="panel-title">{tr('1. Copia nella cartella resourcepacks')}</h3>
      {!status ? (
        <p className="small">…</p>
      ) : !status.available ? (
        <p className="small muted" data-testid="sync-reason">
          {status.reason}
        </p>
      ) : (
        <>
          <p className="small" data-testid="sync-target">
            {status.target}
            {status.state === 'missing' && tr(', non ancora copiato')}
            {status.state === 'ours' && tr(', copia di PackForge')}
          </p>
          {status.state === 'foreign' && (
            <p className="field-error small">
              {tr(
                'Lì c’è già una cartella con questo nome che PackForge non ha creato: non la tocco. Rinominala o spostala, poi riprova.'
              )}
            </p>
          )}
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={busy || status.state === 'foreign'}
              onClick={() => void copyNow()}
            >
              {status.state === 'ours' ? tr('Aggiorna la copia') : tr('Copia nel gioco')}
            </button>
            <button type="button" onClick={() => void window.api.invoke('sync:openFolder')}>
              {tr('Apri la cartella resourcepacks')}
            </button>
          </div>
          <label
            className="inline-check small"
            title={tr(
              'Ogni volta che salvi (o un file del pack cambia), la copia si aggiorna da sola: in gioco basta F3 + T'
            )}
          >
            <input
              type="checkbox"
              checked={status.auto}
              disabled={status.state !== 'ours'}
              onChange={(event) =>
                void window.api.invoke('sync:setAuto', event.target.checked).then(setStatus)
              }
            />
            {tr('Aggiorna la copia da sola dopo ogni modifica')}
          </label>
          {last && (
            <p className={last.error ? 'field-error small' : 'small muted'} data-testid="sync-last">
              {last.error ??
                tr(
                  'Ultima copia alle {0}: {1} file copiati, {2} rimossi.',
                  new Date(last.at).toLocaleTimeString(locale()),
                  last.copied,
                  last.removed
                )}
            </p>
          )}
          <p className="small muted">
            {tr(
              'È una copia, non un collegamento: Minecraft ignora i collegamenti in resourcepacks se non sono autorizzati in allowed_symlinks.txt.'
            )}
          </p>
        </>
      )}

      <h3 className="panel-title">{tr('2. In gioco')}</h3>
      <ol className="small ingame-steps">
        <li>
          {tr('Opzioni')} <Glyph name="arrowRight" />{' '}
          {tr(
            'Pacchetti di risorse: sposta «{0}» nella colonna di destra (più in alto = vince sugli altri).',
            packName
          )}
        </li>
        <li>{tr('Dopo ogni modifica salvata premi F3 + T.')}</li>
        <li>
          {tr(
            'Per _n e _s serve uno shader pack LabPBR con Iris (Fabric); per le texture connesse Continuity (o OptiFine).'
          )}
        </li>
        <li>{tr('Se il pack appare in rosso, il pack_format non è quello della tua versione.')}</li>
      </ol>

      <h3 className="panel-title">{tr('Tasti utili')}</h3>
      <KeyTable rows={HOTKEYS} />
      <h3 className="panel-title">{tr('Shader (Iris)')}</h3>
      <KeyTable rows={IRIS_KEYS} />

      <div className="row">
        <button type="button" onClick={onClose}>
          {tr('Chiudi')}
        </button>
      </div>
    </DialogFrame>
  )
}

function KeyTable({ rows }: { rows: ReadonlyArray<[string, string]> }): React.JSX.Element {
  return (
    <table className="coverage-table small key-table">
      <tbody>
        {rows.map(([key, what]) => (
          <tr key={key}>
            <td>
              <kbd>{key}</kbd>
            </td>
            <td>{what}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
