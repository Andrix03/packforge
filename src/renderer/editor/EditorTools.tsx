import type { UsedColor } from './color'
import { ColorPanel } from './ColorPanel'
import type { FillMode, Rgba } from './pixels'
import type { NoiseStrength } from './ramp'

export type SelectionAction =
  | 'all'
  | 'none'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'flipH'
  | 'flipV'
  | 'rotate'
  | 'delete'
  | 'drop'
  | 'cancel'
import {
  BRUSH_TOOLS,
  maxBrushSize,
  MIRROR_TOOLS,
  SELECTION_TOOLS,
  TOOLS,
  visibleTools,
  type ToolId
} from './tools'

interface EditorToolsProps {
  tool: ToolId
  onTool: (tool: ToolId) => void
  pixelPerfect: boolean
  onPixelPerfect: (value: boolean) => void
  brushSize: number
  onBrushSize: (size: number) => void
  shapeFilled: boolean
  onShapeFilled: (filled: boolean) => void
  mirror: { x: boolean; y: boolean }
  onMirror: (mirror: { x: boolean; y: boolean }) => void
  /** Selection buttons (shown with the selection tools or when something is selected). */
  selection: { active: boolean; floating: boolean; canPaste: boolean }
  onSelectionAction: (action: SelectionAction) => void
  /** The shading ramp section, shown under the colors. */
  rampPanel: React.ReactNode
  /** Painting a map channel: replaces the colors and the ramp with a value picker. */
  valuePanel?: React.ReactNode
  fillMode: FillMode
  onFillMode: (mode: FillMode) => void
  noiseStrength: NoiseStrength
  onNoiseStrength: (strength: NoiseStrength) => void
  primary: Rgba
  secondary: Rgba
  onColor: (slot: 'primary' | 'secondary', color: Rgba) => void
  onSwap: () => void
  recent: readonly Rgba[]
  palette: readonly UsedColor[]
  disabled: boolean
  /** Pro mode: bigger brushes, pixel-perfect, full color panel. */
  pro: boolean
  showTips: boolean
}

export function EditorTools(props: EditorToolsProps): React.JSX.Element {
  const active = TOOLS.find((tool) => tool.id === props.tool)!
  return (
    <aside className="editor-tools card">
      <div className="tool-list" role="toolbar" aria-label="Strumenti">
        {visibleTools(props.pro).map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={props.tool === tool.id ? 'tool active' : 'tool'}
            aria-pressed={props.tool === tool.id}
            title={`${tool.label} (${tool.shortcut})`}
            onClick={() => props.onTool(tool.id)}
            disabled={props.disabled}
          >
            {tool.label}
            <kbd>{tool.shortcut}</kbd>
          </button>
        ))}
      </div>

      {BRUSH_TOOLS.has(props.tool) && (
        <label className="color-slider" title="Dimensione del pennello quadrato ( [ e ] )">
          <span className="small muted">
            Pennello <span className="slider-value">{props.brushSize} px</span>
          </span>
          <input
            type="range"
            min={1}
            max={maxBrushSize(props.pro)}
            value={props.brushSize}
            onChange={(event) => props.onBrushSize(Number(event.target.value))}
          />
        </label>
      )}

      {props.pro && props.tool === 'pencil' && props.brushSize === 1 && (
        <label
          className="inline-check small"
          title="Toglie gli angoli a L mentre disegni, così le linee restano spesse un pixel."
        >
          <input
            type="checkbox"
            checked={props.pixelPerfect}
            onChange={(event) => props.onPixelPerfect(event.target.checked)}
          />
          Pixel-perfect
        </label>
      )}

      {(props.tool === 'rect' || props.tool === 'ellipse') && (
        <label
          className="inline-check small"
          title="Riempie la forma invece di disegnarne solo il bordo"
        >
          <input
            type="checkbox"
            checked={props.shapeFilled}
            onChange={(event) => props.onShapeFilled(event.target.checked)}
          />
          Pieno
        </label>
      )}

      {props.pro && MIRROR_TOOLS.has(props.tool) && (
        <div className="mirror-toggles small" role="group" aria-label="Simmetria">
          <span className="muted">Simmetria</span>
          <label className="inline-check" title="Specchia sinistra ↔ destra">
            <input
              type="checkbox"
              checked={props.mirror.x}
              onChange={(event) => props.onMirror({ ...props.mirror, x: event.target.checked })}
            />
            ↔
          </label>
          <label className="inline-check" title="Specchia sopra ↕ sotto">
            <input
              type="checkbox"
              checked={props.mirror.y}
              onChange={(event) => props.onMirror({ ...props.mirror, y: event.target.checked })}
            />
            ↕
          </label>
        </div>
      )}

      {props.pro && (SELECTION_TOOLS.has(props.tool) || props.selection.active) && (
        <div className="selection-actions" role="group" aria-label="Selezione">
          {(
            [
              ['all', 'Tutto', 'Seleziona tutto (Ctrl+A)', true],
              ['none', 'Deseleziona', 'Togli la selezione (Ctrl+D)', props.selection.active],
              ['copy', 'Copia', 'Copia (Ctrl+C)', props.selection.active],
              ['cut', 'Taglia', 'Taglia (Ctrl+X)', props.selection.active],
              ['paste', 'Incolla', 'Incolla (Ctrl+V)', props.selection.canPaste],
              ['flipH', '↔', 'Rifletti orizzontalmente (Maiusc+H)', true],
              ['flipV', '↕', 'Rifletti verticalmente (Maiusc+V)', true],
              ['rotate', '⟳ 90°', 'Ruota di 90° (Maiusc+R)', true],
              ['delete', 'Elimina', 'Cancella i pixel selezionati (Canc)', props.selection.active],
              ['drop', 'Appoggia', 'Appoggia il pezzo spostato (Invio)', props.selection.floating]
            ] as const
          ).map(([action, label, title, enabled]) => (
            <button
              key={action}
              type="button"
              title={title}
              disabled={!enabled}
              onClick={() => props.onSelectionAction(action)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {(props.tool === 'fill' || props.tool === 'noise' || props.tool === 'wand') && (
        <div className="tabs small-tabs" role="radiogroup" aria-label="Modalità del secchiello">
          {(
            [
              ['contiguous', 'Area', 'Solo i pixel uguali collegati a quello cliccato'],
              ['global', 'Globale', 'Tutti i pixel di quel colore nella texture']
            ] as const
          ).map(([mode, label, title]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={props.fillMode === mode}
              className={props.fillMode === mode ? 'tab active' : 'tab'}
              title={title}
              onClick={() => props.onFillMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {props.tool === 'noise' && (
        <div className="tabs small-tabs" role="radiogroup" aria-label="Intensità del rumore">
          {(
            [
              [
                'soft',
                'Leggero',
                'Le 3 tonalità centrali della rampa: una grana fine (pietra, legno)'
              ],
              ['full', 'Forte', 'Tutte le 5 tonalità, anche le più scure e chiare (ghiaia, terra)']
            ] as const
          ).map(([strength, label, title]) => (
            <button
              key={strength}
              type="button"
              role="radio"
              aria-checked={props.noiseStrength === strength}
              className={props.noiseStrength === strength ? 'tab active' : 'tab'}
              title={title}
              onClick={() => props.onNoiseStrength(strength)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {props.showTips && <p className="tool-tip small muted">{active.tip}</p>}

      {props.valuePanel ?? (
        <>
          <ColorPanel
            primary={props.primary}
            secondary={props.secondary}
            onChange={props.onColor}
            onSwap={props.onSwap}
            recent={props.recent}
            palette={props.palette}
            pro={props.pro}
          />
          {props.rampPanel}
        </>
      )}
    </aside>
  )
}
