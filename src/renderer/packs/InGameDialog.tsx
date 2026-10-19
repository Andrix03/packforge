import { useEffect, useState } from 'react'
import type { SyncStatus } from '../../shared/ipc'

/** Debug hotkeys useful while testing a pack (minecraft.wiki "Debug hotkey", 26.x). */
const HOTKEYS: ReadonlyArray<[string, string]> = [
  ['F3 + T', 'Ricarica i resource pack (texture, modelli, suoni): da premere dopo ogni modifica'],
  ['F3 + A', 'Ricarica i chunk caricati'],
  ['F3 + G', 'Mostra i confini dei chunk'],
  ['F3 + B', 'Mostra le hitbox delle entità'],
  ['F3 + H', 'Tooltip avanzati degli oggetti (id, durabilità)'],
  ['F3 + Esc', 'Pausa senza menu (solo giocatore singolo): utile per guardare da vicino'],
  ['F3 + F4', 'Cambia modalità di gioco'],
  ['F3 + N', 'Passa a spettatore e ritorno']
]

/** Iris defaults (Iris guide; they can be changed in Controlli). */
const IRIS_KEYS: ReadonlyArray<[string, string]> = [
  ['R', 'Ricarica lo shader pack (dopo aver cambiato _n / _s basta F3 + T)'],
  ['K', 'Attiva / disattiva gli shader: confronto immediato con e senza'],
  ['O', 'Menu degli shader pack, con lo sfondo trasparente']
]

/** Test the pack in the game: its copy in resourcepacks and the keys to remember. */
export function InGameDialog({
  packName,
  onClose
}: {
  packName: string
  onClose: () => void
}): React.JSX.Element {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)

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
    setStatus(await window.api.invoke('sync:now'))
    setBusy(false)
  }

  const last = status?.last
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal batch"
        role="dialog"
        aria-label="Prova in gioco"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Prova {packName} in gioco</h2>

        <h3 className="panel-title">1. Copia nella cartella resourcepacks</h3>
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
              {status.state === 'missing' && ' · non ancora copiato'}
              {status.state === 'ours' && ' · copia di PackForge'}
            </p>
            {status.state === 'foreign' && (
              <p className="field-error small">
                Lì c’è già una cartella con questo nome che PackForge non ha creato: non la tocco.
                Rinominala o spostala, poi riprova.
              </p>
            )}
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={busy || status.state === 'foreign'}
                onClick={() => void copyNow()}
              >
                {status.state === 'ours' ? 'Aggiorna la copia' : 'Copia nel gioco'}
              </button>
              <button type="button" onClick={() => void window.api.invoke('sync:openFolder')}>
                Apri la cartella resourcepacks
              </button>
            </div>
            <label
              className="inline-check small"
              title="Ogni volta che salvi (o un file del pack cambia), la copia si aggiorna da sola: in gioco basta F3 + T"
            >
              <input
                type="checkbox"
                checked={status.auto}
                disabled={status.state !== 'ours'}
                onChange={(event) =>
                  void window.api.invoke('sync:setAuto', event.target.checked).then(setStatus)
                }
              />
              Aggiorna la copia da sola dopo ogni modifica
            </label>
            {last && (
              <p
                className={last.error ? 'field-error small' : 'small muted'}
                data-testid="sync-last"
              >
                {last.error ??
                  `Ultima copia alle ${new Date(last.at).toLocaleTimeString('it-IT')}: ${last.copied} file copiati, ${last.removed} rimossi.`}
              </p>
            )}
            <p className="small muted">
              È una copia, non un collegamento: Minecraft ignora i collegamenti in resourcepacks se
              non sono autorizzati in allowed_symlinks.txt.
            </p>
          </>
        )}

        <h3 className="panel-title">2. In gioco</h3>
        <ol className="small ingame-steps">
          <li>
            Opzioni → Pacchetti di risorse: sposta «{packName}» nella colonna di destra (più in alto
            = vince sugli altri).
          </li>
          <li>Dopo ogni modifica salvata premi F3 + T.</li>
          <li>
            Per _n e _s serve uno shader pack LabPBR con Iris (Fabric); per le texture connesse
            Continuity (o OptiFine).
          </li>
          <li>Se il pack appare in rosso, il pack_format non è quello della tua versione.</li>
        </ol>

        <h3 className="panel-title">Tasti utili</h3>
        <KeyTable rows={HOTKEYS} />
        <h3 className="panel-title">Shader (Iris)</h3>
        <KeyTable rows={IRIS_KEYS} />

        <div className="row">
          <button type="button" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
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
