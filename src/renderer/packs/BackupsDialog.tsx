import { useEffect, useState } from 'react'
import type { BackupInfo } from '../../shared/ipc'
import { useEscape } from '../useEscape'
import { Glyph } from '../ui/components'

/** The pack's backups (taken before batch, variants, resize, CTM and saves), with restore. */
export function BackupsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [run, setRun] = useState(0)
  useEscape(onClose, !busy)

  useEffect(() => {
    let current = true
    void window.api.invoke('backup:list').then((list) => current && setBackups(list))
    return () => {
      current = false
    }
  }, [run])

  async function restore(backup: BackupInfo): Promise<void> {
    const parts = [
      backup.saved > 0 &&
        `${backup.saved === 1 ? '1 file torna' : `${backup.saved} file tornano`} com’erano`,
      backup.created > 0 &&
        `${backup.created === 1 ? '1 file creato viene rimosso' : `${backup.created} file creati vengono rimossi`}`
    ].filter(Boolean)
    if (
      !window.confirm(
        `Ripristinare «${backup.label}»? ${parts.join(' e ')}. Prima viene fatto un backup dello stato attuale, quindi si può tornare indietro.`
      )
    ) {
      return
    }
    setBusy(true)
    const result = await window.api.invoke('backup:restore', backup.id)
    setBusy(false)
    setMessage(
      result.ok
        ? {
            text: `Ripristinato: ${result.restored} file rimessi, ${result.removed} rimossi.`,
            error: false
          }
        : { text: result.error, error: true }
    )
    setRun((r) => r + 1)
  }

  async function remove(backup: BackupInfo): Promise<void> {
    if (!window.confirm(`Eliminare il backup «${backup.label}»? Non si potrà più ripristinare.`))
      return
    await window.api.invoke('backup:delete', backup.id)
    setRun((r) => r + 1)
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal batch"
        role="dialog"
        aria-label="Backup"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>Backup del pack</h2>
        <p className="muted small">
          Prima di sovrascrivere file (salvataggi, Applica in blocco, Varianti, Ridimensiona,
          Texture connesse) PackForge ne copia lo stato. Restano fuori dal pack, gli ultimi 50.
        </p>
        {message && (
          <p className={message.error ? 'field-error small' : 'small'} data-testid="backup-message">
            {message.text}
          </p>
        )}
        {!backups ? (
          <p className="small">…</p>
        ) : backups.length === 0 ? (
          <p className="small" data-testid="backup-empty">
            Ancora nessun backup.
          </p>
        ) : (
          <ul className="validator-issues" aria-label="Backup">
            {backups.map((backup) => (
              <li key={backup.id} className="validator-issue info backup-row">
                <span className="validator-icon">
                  <Glyph name="clock" alone />
                </span>
                <div>
                  <strong>{backup.label}</strong>
                  <p className="small muted">
                    {new Date(backup.at).toLocaleString('it-IT')}, {backup.saved} file salvati
                    {backup.created > 0 && `, ${backup.created} file nuovi (tolti se ripristini)`}
                  </p>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="small-button"
                    disabled={busy}
                    onClick={() => void restore(backup)}
                  >
                    Ripristina
                  </button>
                  <button
                    type="button"
                    className="small-button"
                    disabled={busy}
                    onClick={() => void remove(backup)}
                  >
                    Elimina
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="button" className="primary" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  )
}
