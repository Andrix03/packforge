import { useState } from 'react'
import { MAX_LAYERS, type EditorDocument } from './document'
import type { Command } from './history'

/**
 * Layers, top layer first (like every paint program). All changes are undo steps except choosing
 * the active layer. Layers live only while the editor is open: saving flattens them into the PNG.
 */
export function LayersPanel({
  doc,
  onCommand,
  onSelect,
  onBeforeChange
}: {
  doc: EditorDocument
  /** An applied structural change to record (or null when nothing changed). */
  onCommand: (command: Command | null) => void
  onSelect: (id: number) => void
  /** Called before any change (puts down a floating piece). */
  onBeforeChange: () => void
}): React.JSX.Element {
  const [renaming, setRenaming] = useState<number | null>(null)
  const active = doc.active
  const activeIndex = doc.indexOf(active.id)
  const run = (change: () => Command | null): void => {
    onBeforeChange()
    onCommand(change())
  }

  return (
    <section className="card layers-panel">
      <div className="row">
        <strong className="small">Livelli</strong>
        <span className="muted small">
          {doc.layers.length}/{MAX_LAYERS}
        </span>
      </div>
      <ul className="layer-list">
        {[...doc.layers].reverse().map((layer) => (
          <li key={layer.id} className={layer.id === active.id ? 'layer active' : 'layer'}>
            <button
              type="button"
              className="layer-eye"
              title={layer.visible ? 'Nascondi' : 'Mostra'}
              aria-pressed={layer.visible}
              onClick={() => run(() => doc.setVisible(layer.id, !layer.visible))}
            >
              {layer.visible ? '●' : '○'}
            </button>
            {renaming === layer.id ? (
              <input
                className="layer-name-input"
                defaultValue={layer.name}
                autoFocus
                maxLength={40}
                onBlur={(event) => {
                  onCommand(doc.rename(layer.id, event.target.value))
                  setRenaming(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <button
                type="button"
                className="layer-name"
                onClick={() => {
                  onBeforeChange()
                  onSelect(layer.id)
                }}
                onDoubleClick={() => setRenaming(layer.id)}
                title="Clic: livello attivo · doppio clic: rinomina"
              >
                {layer.name}
                {layer.opacity < 1 && (
                  <span className="muted small"> {Math.round(layer.opacity * 100)}%</span>
                )}
              </button>
            )}
          </li>
        ))}
      </ul>
      <label className="color-slider" title="Opacità del livello attivo">
        <span className="small muted">
          Opacità <span className="slider-value">{Math.round(active.opacity * 100)}%</span>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(active.opacity * 100)}
          // Every value is an undo command; consecutive ones merge into one step (History).
          onChange={(event) =>
            run(() => doc.setOpacity(active.id, Number(event.target.value) / 100))
          }
        />
      </label>
      <div className="layer-actions">
        <button type="button" onClick={() => run(() => doc.addLayer())} title="Nuovo livello vuoto">
          + Nuovo
        </button>
        <button
          type="button"
          onClick={() => run(() => doc.duplicateLayer(active.id))}
          title="Duplica il livello attivo"
        >
          Duplica
        </button>
        <button
          type="button"
          onClick={() => run(() => doc.moveLayer(active.id, 1))}
          disabled={activeIndex === doc.layers.length - 1}
          title="Sposta su"
          aria-label="Sposta su"
        >
          ▲
        </button>
        <button
          type="button"
          onClick={() => run(() => doc.moveLayer(active.id, -1))}
          disabled={activeIndex === 0}
          title="Sposta giù"
          aria-label="Sposta giù"
        >
          ▼
        </button>
        <button
          type="button"
          onClick={() => run(() => doc.mergeDown(active.id))}
          disabled={activeIndex === 0}
          title="Unisci con il livello sotto"
        >
          Unisci giù
        </button>
        <button
          type="button"
          onClick={() => run(() => doc.removeLayer(active.id))}
          disabled={doc.layers.length === 1}
          title="Elimina il livello attivo"
        >
          Elimina
        </button>
      </div>
      <p className="muted small">I livelli si uniscono quando salvi: il PNG ne ha uno solo.</p>
    </section>
  )
}
