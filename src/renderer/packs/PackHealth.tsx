// "Salute del pack" (v3 Pack section): how far the pack is, in a few bars. PBR maps complete,
// game textures remade, and when the last backup was taken.
import { useEffect, useState } from 'react'
import type { BackupInfo } from '../../shared/ipc'
import { locale, tr } from '../../shared/i18n'
import { ProgressBar } from '../ui/components'

export function PackHealth({
  withMaps,
  textures,
  remade,
  gameTextures,
  canBackup,
  revision
}: {
  /** Pack textures with both _n and _s. */
  withMaps: number
  /** Pack textures that can have maps. */
  textures: number
  /** Pack textures that replace a game texture. */
  remade: number
  /** Game textures, or null while the jar is not loaded. */
  gameTextures: number | null
  /** Folder packs keep backups; zips are read-only. */
  canBackup: boolean
  /** Changes when the pack's files change: the backup list is read again. */
  revision: number
}): React.JSX.Element {
  const [lastBackup, setLastBackup] = useState<BackupInfo | null | undefined>(undefined)
  useEffect(() => {
    if (!canBackup) return
    let current = true
    void window.api
      .invoke('backup:list')
      .then((list) => current && setLastBackup(list[0] ?? null))
      .catch(() => current && setLastBackup(null))
    return () => {
      current = false
    }
  }, [canBackup, revision])

  return (
    <section className="pack-health" aria-label={tr('Salute del pack')}>
      <h3 className="ph">{tr('Salute del pack')}</h3>
      <ProgressBar label={tr('Mappe PBR complete (_n e _s)')} done={withMaps} total={textures} />
      {gameTextures !== null ? (
        <ProgressBar label={tr('Texture del gioco rifatte')} done={remade} total={gameTextures} />
      ) : (
        <ProgressBar label={tr('Leggo le texture del gioco')} />
      )}
      {canBackup && lastBackup !== undefined && (
        <p className="muted small" data-testid="last-backup">
          {lastBackup
            ? tr('Ultimo backup: {0}', new Date(lastBackup.at).toLocaleString(locale()))
            : tr('Nessun backup ancora: PackForge ne prende uno prima di sovrascrivere i file.')}
        </p>
      )}
    </section>
  )
}
