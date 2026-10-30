import { useEffect, useState } from 'react'
import { confirmAction } from '../ui/ask'
import type { BackupInfo } from '../../shared/ipc'
import { useEscape } from '../useEscape'
import { Glyph } from '../ui/components'
import { locale, tr } from '../../shared/i18n'

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
        tr(
          '{0} com’erano',
          backup.saved === 1 ? tr('1 file torna') : tr('{0} file tornano', backup.saved)
        ),
      backup.created > 0 &&
        `${backup.created === 1 ? tr('1 file creato viene rimosso') : tr('{0} file creati vengono rimossi', backup.created)}`
    ].filter(Boolean)
    if (
      !(await confirmAction(
        tr(
          'Ripristinare «{0}»? {1}. Prima viene fatto un backup dello stato attuale, quindi si può tornare indietro.',
          backup.label,
          parts.join(' e ')
        )
      ))
    ) {
      return
    }
    setBusy(true)
    const result = await window.api.invoke('backup:restore', backup.id)
    setBusy(false)
    setMessage(
      result.ok
        ? {
            text: tr(
              'Ripristinato: {0} file rimessi, {1} rimossi.',
              result.restored,
              result.removed
            ),
            error: false
          }
        : { text: result.error, error: true }
    )
    setRun((r) => r + 1)
  }

  async function remove(backup: BackupInfo): Promise<void> {
    if (
      !(await confirmAction(
        tr('Eliminare il backup «{0}»? Non si potrà più ripristinare.', backup.label)
      ))
    )
      return
    await window.api.invoke('backup:delete', backup.id)
    setRun((r) => r + 1)
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal batch"
        role="dialog"
        aria-label={tr('Backup')}
        onClick={(event) => event.stopPropagation()}
      >
        <h2>{tr('Backup del pack')}</h2>
        <p className="muted small">
          {tr(
            'Prima di sovrascrivere file (salvataggi, Applica in blocco, Varianti, Ridimensiona, Texture connesse) PackForge ne copia lo stato. Restano fuori dal pack, gli ultimi 50.'
          )}
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
            {tr('Ancora nessun backup.')}
          </p>
        ) : (
          <ul className="validator-issues" aria-label={tr('Backup')}>
            {backups.map((backup) => (
              <li key={backup.id} className="validator-issue info backup-row">
                <span className="validator-icon">
                  <Glyph name="clock" alone />
                </span>
                <div>
                  <strong>{backup.label}</strong>
                  <p className="small muted">
                    {tr(
                      '{0}, {1} file salvati',
                      new Date(backup.at).toLocaleString(locale()),
                      backup.saved
                    )}
                    {backup.created > 0 &&
                      tr(', {0} file nuovi (tolti se ripristini)', backup.created)}
                  </p>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="small-button"
                    disabled={busy}
                    onClick={() => void restore(backup)}
                  >
                    {tr('Ripristina')}
                  </button>
                  <button
                    type="button"
                    className="small-button"
                    disabled={busy}
                    onClick={() => void remove(backup)}
                  >
                    {tr('Elimina')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="button" className="primary" onClick={onClose}>
            {tr('Chiudi')}
          </button>
        </div>
      </div>
    </div>
  )
}
