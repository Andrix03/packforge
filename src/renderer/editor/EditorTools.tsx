import { useRef } from 'react'
import { fromHex, toHex, type FillMode, type Rgba } from './pixels'
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
  onPrimary: (color: Rgba) => void
  onSecondary: (color: Rgba) => void
  onSwap: () => void
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

      <div className="color-pair">
        <ColorSwatch
          label="Primario (clic sinistro)"
          color={props.primary}
          onChange={props.onPrimary}
        />
        <ColorSwatch
          label="Secondario (clic destro)"
          color={props.secondary}
          onChange={props.onSecondary}
        />
        <div className="row">
          <button type="button" onClick={props.onSwap} title="Scambia i colori (X)">
            ⇄ Scambia <kbd>X</kbd>
          </button>
          <button
            type="button"
            onClick={() => props.onSecondary([0, 0, 0, 0])}
            title="Il secondario torna trasparente: il clic destro cancella"
            disabled={props.secondary[3] === 0}
          >
            Trasparente
          </button>
        </div>
      </div>
    </aside>
  )
}

function ColorSwatch({
  label,
  color,
  onChange
}: {
  label: string
  color: Rgba
  onChange: (color: Rgba) => void
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const transparent = color[3] === 0
  return (
    <div className="color-swatch-row">
      <button
        type="button"
        className={transparent ? 'color-swatch checker' : 'color-swatch'}
        style={transparent ? undefined : { background: toHex(color) }}
        onClick={() => inputRef.current?.click()}
        aria-label={`${label}: cambia colore`}
      />
      <div className="color-swatch-text">
        <span className="small">{label}</span>
        <span className="small muted">{transparent ? 'trasparente' : toHex(color)}</span>
      </div>
      <input
        ref={inputRef}
        type="color"
        className="visually-hidden"
        tabIndex={-1}
        value={transparent ? '#000000' : toHex(color)}
        onChange={(event) => {
          const parsed = fromHex(event.target.value)
          if (parsed) onChange(parsed)
        }}
      />
    </div>
  )
}
