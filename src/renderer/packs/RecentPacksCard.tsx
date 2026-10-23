import { useEffect, useState } from 'react'
import type { RecentPackStatus } from '../../shared/settings'
import { formatRelativeTime } from '../../shared/time'
import { tr } from '../../shared/i18n'

interface RecentPacksCardProps {
  onOpen: (path: string) => void
  busy: boolean
}

export function RecentPacksCard({ onOpen, busy }: RecentPacksCardProps): React.JSX.Element | null {
  const [recent, setRecent] = useState<RecentPackStatus[] | null>(null)

  useEffect(() => {
    void window.api.invoke('recent:list').then(setRecent)
  }, [])

  async function remove(path: string): Promise<void> {
    setRecent(await window.api.invoke('recent:remove', path))
  }

  if (!recent || recent.length === 0) return null

  return (
    <section className="card form">
      <h2>{tr('Recenti')}</h2>
      <ul className="recent-list">
        {recent.map((pack) => (
          <li key={pack.path} className={pack.exists ? undefined : 'missing'}>
            <button
              type="button"
              className="recent-open"
              onClick={() => onOpen(pack.path)}
              disabled={busy || !pack.exists}
              title={pack.exists ? pack.path : tr('Non trovato: {0}', pack.path)}
            >
              <span className="recent-name">
                {pack.name}{' '}
                <span className="badge">{pack.kind === 'zip' ? 'zip' : 'cartella'}</span>
              </span>
              <span className="recent-path">{pack.path}</span>
            </button>
            <span className="muted small recent-when">
              {pack.exists ? formatRelativeTime(pack.openedAt) : tr('non trovato')}
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={() => void remove(pack.path)}
              title={tr("Rimuovi dall'elenco (il pack non viene cancellato)")}
              aria-label={tr('Rimuovi {0} dai recenti', pack.name)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
