import { useState } from 'react'
import { MAX_LAYERS, type EditorDocument } from './document'
import type { Command } from './history'
import { Glyph, RangeInput } from '../ui/components'
import { tr } from '../../shared/i18n'

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
        <strong className="small">{tr('Livelli')}</strong>
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
              title={layer.visible ? tr('Nascondi') : tr('Mostra')}
              aria-pressed={layer.visible}
              onClick={() => run(() => doc.setVisible(layer.id, !layer.visible))}
            >
              <Glyph name={layer.visible ? 'dot' : 'ring'} alone />
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
                title={tr('Clic: livello attivo. Doppio clic: rinomina')}
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
      <label className="color-slider" title={tr('Opacità del livello attivo')}>
        <span className="small muted">
          {tr('Opacità')} <span className="slider-value">{Math.round(active.opacity * 100)}%</span>
        </span>
        <RangeInput
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
        <button
          type="button"
          onClick={() => run(() => doc.addLayer())}
          title={tr('Nuovo livello vuoto')}
        >
          {tr('+ Nuovo')}
        </button>
        <button
          type="button"
          onClick={() => run(() => doc.duplicateLayer(active.id))}
          title={tr('Duplica il livello attivo')}
        >
          {tr('Duplica')}
        </button>
        <button
          type="button"
          onClick={() => run(() => doc.moveLayer(active.id, 1))}
          disabled={activeIndex === doc.layers.length - 1}
          title={tr('Sposta su')}
          aria-label={tr('Sposta su')}
        >
          <Glyph name="up" alone />
        </button>
        <button
          type="button"
          onClick={() => run(() => doc.moveLayer(active.id, -1))}
          disabled={activeIndex === 0}
          title={tr('Sposta giù')}
          aria-label={tr('Sposta giù')}
        >
          <Glyph name="down" alone />
        </button>
        <button
          type="button"
          onClick={() => run(() => doc.mergeDown(active.id))}
          disabled={activeIndex === 0}
          title={tr('Unisci con il livello sotto')}
        >
          {tr('Unisci giù')}
        </button>
        <button
          type="button"
          onClick={() => run(() => doc.removeLayer(active.id))}
          disabled={doc.layers.length === 1}
          title={tr('Elimina il livello attivo')}
        >
          {tr('Elimina')}
        </button>
      </div>
      <p className="muted small">
        {tr('I livelli si uniscono quando salvi: il PNG ne ha uno solo.')}
      </p>
    </section>
  )
}
