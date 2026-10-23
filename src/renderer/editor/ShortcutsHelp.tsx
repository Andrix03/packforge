import { shortcutsFor } from './shortcuts'
import { tr } from '../../shared/i18n'

/** Window with every keyboard shortcut available in the current mode. */
export function ShortcutsHelp({
  pro,
  onClose
}: {
  pro: boolean
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="modal-backdrop editor-help" role="presentation" onClick={onClose}>
      <section
        className="card modal shortcuts-help"
        role="dialog"
        aria-label={tr('Scorciatoie da tastiera')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row">
          <h2>{tr('Scorciatoie da tastiera')}</h2>
          <button type="button" onClick={onClose}>
            {tr('Chiudi')}
          </button>
        </div>
        {!pro && (
          <p className="muted small">
            {tr(
              'Modalità Principiante: in Pro trovi anche forme, selezioni e le loro scorciatoie.'
            )}
          </p>
        )}
        <div className="shortcut-groups">
          {shortcutsFor(pro).map((group) => (
            <div key={group.title}>
              <h3 className="panel-title">{group.title}</h3>
              <dl className="shortcut-list">
                {group.items.map((item) => (
                  <div key={item.keys + item.label}>
                    <dt>
                      <kbd>{item.keys}</kbd>
                    </dt>
                    <dd className="small">{item.label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
