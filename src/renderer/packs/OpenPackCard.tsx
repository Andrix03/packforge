import { tr } from '../../shared/i18n'
interface OpenPackCardProps {
  onPick: (path: string) => void
  busy: boolean
  error: string | null
}

export function OpenPackCard({ onPick, busy, error }: OpenPackCardProps): React.JSX.Element {
  async function pickFolder(): Promise<void> {
    const path = await window.api.invoke('dialog:pickDirectory', 'openPack')
    if (path) onPick(path)
  }

  async function pickZip(): Promise<void> {
    const path = await window.api.invoke('dialog:pickPackZip')
    if (path) onPick(path)
  }

  return (
    <section className="card form">
      <h2>{tr('Apri pack')}</h2>
      <p className="muted">{tr('Apri una cartella o uno zip che contiene pack.mcmeta.')}</p>
      <div className="row">
        <button type="button" onClick={() => void pickFolder()} disabled={busy}>
          {tr('Apri cartella…')}
        </button>
        <button type="button" onClick={() => void pickZip()} disabled={busy}>
          {tr('Apri zip…')}
        </button>
      </div>
      {busy && <span className="muted">{tr('Apertura…')}</span>}
      {error && <span className="field-error">{error}</span>}
    </section>
  )
}
