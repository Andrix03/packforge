import type { UsedColor } from './color'
import { ColorPanel } from './ColorPanel'
import type { FillMode, Rgba } from './pixels'
import { BRUSH_TOOLS, maxBrushSize, TOOLS, type ToolId } from './tools'

interface EditorToolsProps {
  tool: ToolId
  onTool: (tool: ToolId) => void
  pixelPerfect: boolean
  onPixelPerfect: (value: boolean) => void
  brushSize: number
  onBrushSize: (size: number) => void
  /** The shading ramp section, shown under the colors. */
  rampPanel: React.ReactNode
  fillMode: FillMode
  onFillMode: (mode: FillMode) => void
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
        {TOOLS.map((tool) => (
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

      {(props.tool === 'fill' || props.tool === 'noise') && (
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

      {props.showTips && <p className="tool-tip small muted">{active.tip}</p>}

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
    </aside>
  )
}
