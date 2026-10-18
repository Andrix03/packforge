import type { UsedColor } from './color'
import { ColorPanel } from './ColorPanel'
import type { FillMode, Rgba } from './pixels'
import { TOOLS, type ToolId } from './tools'

interface EditorToolsProps {
  tool: ToolId
  onTool: (tool: ToolId) => void
  pixelPerfect: boolean
  onPixelPerfect: (value: boolean) => void
  fillMode: FillMode
  onFillMode: (mode: FillMode) => void
  primary: Rgba
  secondary: Rgba
  onColor: (slot: 'primary' | 'secondary', color: Rgba) => void
  onSwap: () => void
  recent: readonly Rgba[]
  palette: readonly UsedColor[]
  disabled: boolean
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

      {props.tool === 'pencil' && (
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

      {props.tool === 'fill' && (
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

      <p className="tool-tip small muted">{active.tip}</p>

      <ColorPanel
        primary={props.primary}
        secondary={props.secondary}
        onChange={props.onColor}
        onSwap={props.onSwap}
        recent={props.recent}
        palette={props.palette}
      />
    </aside>
  )
}
