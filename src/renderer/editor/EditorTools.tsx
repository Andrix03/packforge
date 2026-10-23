import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Glyph, PixelIcon } from '../ui/components'
import { CMD_ICONS, NAV_ICONS, TOOL_ICONS, type PixelIconData } from '../ui/icons'
import type { UsedColor } from './color'
import { ColorPanel } from './ColorPanel'
import type { FillMode, Rgba } from './pixels'
import type { NoiseStrength } from './ramp'
import {
  BRUSH_TOOLS,
  maxBrushSize,
  MIRROR_TOOLS,
  SELECTION_TOOLS,
  TOOLS,
  visibleTools,
  type ToolId
} from './tools'

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

export interface EditorToolsProps {
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

const TOOL_PICTURE: Partial<Record<ToolId, PixelIconData>> = { ...NAV_ICONS, ...TOOL_ICONS }

/** Vertical rail of tool icons (the tool name stays in the button for tooltips and tests). */
export function ToolRail(props: EditorToolsProps): React.JSX.Element {
  return (
    <nav
      className="tool-rail tool-list"
      role="toolbar"
      aria-label="Strumenti"
      aria-orientation="vertical"
    >
      {visibleTools(props.pro).map((tool) => {
        const icon = TOOL_PICTURE[tool.id]
        return (
          <button
            key={tool.id}
            type="button"
            className={props.tool === tool.id ? 'tool active' : 'tool'}
            aria-pressed={props.tool === tool.id}
            title={`${tool.label} (${tool.shortcut})`}
            onClick={() => props.onTool(tool.id)}
            disabled={props.disabled}
          >
            {icon && <PixelIcon icon={icon} size={32} />}
            <span className="sr-only">
              {tool.label}
              <kbd>{tool.shortcut}</kbd>
            </span>
          </button>
        )
      })}
    </nav>
  )
}

/** A checkbox drawn as an ore toggle button (the input stays for keyboards and tests). */
function ToggleLabel({
  checked,
  onChange,
  title,
  icon,
  children
}: {
  checked: boolean
  onChange: (value: boolean) => void
  title: string
  icon?: PixelIconData
  children?: ReactNode
}) {
  return (
    <label className={checked ? 'ore-on toggle-label' : 'ore toggle-label'} title={title}>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {icon && <PixelIcon icon={icon} />}
      {children}
    </label>
  )
}

/** Two or three choices drawn as joined ore buttons (radios). */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: T
  options: readonly (readonly [T, string, string])[]
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([id, text, title]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          className={value === id ? 'ore-on' : 'ore'}
          title={title}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/**
 * Options of the active tool in one line above the canvas; when the window is too narrow the line
 * scrolls sideways with arrows at its ends.
 */
export function ToolOptions(props: EditorToolsProps): React.JSX.Element {
  const active = TOOLS.find((tool) => tool.id === props.tool)!
  const strip = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState({ left: false, right: false })

  useEffect(() => {
    const element = strip.current
    if (!element) return
    const update = (): void => {
      const left = element.scrollLeft > 1
      const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 1
      setOverflow((now) => (now.left === left && now.right === right ? now : { left, right }))
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    element.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', update)
    }
  }, [])

  const scroll = (dx: number): void => strip.current?.scrollBy({ left: dx, behavior: 'smooth' })
  const max = maxBrushSize(props.pro)

  return (
    <div className="tool-options" role="group" aria-label={`Opzioni: ${active.label}`}>
      <span className="ph big tool-name">{active.label}</span>
      {overflow.left && (
        <button
          type="button"
          className="ore ico"
          aria-label="Opzioni precedenti"
          onClick={() => scroll(-240)}
        >
          <PixelIcon icon={CMD_ICONS.less} />
        </button>
      )}
      <div className="tool-options-strip" ref={strip}>
        {BRUSH_TOOLS.has(props.tool) && (
          <div className="option-group" title="Dimensione del pennello quadrato ( [ e ] )">
            <PixelIcon icon={CMD_ICONS.brush} />
            <button
              type="button"
              className="ore ico"
              aria-label="Pennello più piccolo"
              disabled={props.brushSize <= 1}
              onClick={() => props.onBrushSize(Math.max(1, props.brushSize - 1))}
            >
              <PixelIcon icon={CMD_ICONS.minus} />
            </button>
            <label className="brush-size">
              <span className="sr-only">Pennello</span>
              <input
                className="ui-field"
                type="number"
                min={1}
                max={max}
                value={props.brushSize}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next))
                    props.onBrushSize(Math.min(max, Math.max(1, Math.round(next))))
                }}
              />
              <span className="muted">px</span>
            </label>
            <button
              type="button"
              className="ore ico"
              aria-label="Pennello più grande"
              disabled={props.brushSize >= max}
              onClick={() => props.onBrushSize(Math.min(max, props.brushSize + 1))}
            >
              <PixelIcon icon={CMD_ICONS.plus} />
            </button>
          </div>
        )}

        {props.pro && props.tool === 'pencil' && props.brushSize === 1 && (
          <ToggleLabel
            checked={props.pixelPerfect}
            onChange={props.onPixelPerfect}
            icon={CMD_ICONS.pixelPerfect}
            title="Pixel-perfect: toglie gli angoli a L mentre disegni, così le linee restano spesse un pixel."
          >
            <span className="sr-only">Pixel-perfect</span>
          </ToggleLabel>
        )}

        {(props.tool === 'rect' || props.tool === 'ellipse') && (
          <ToggleLabel
            checked={props.shapeFilled}
            onChange={props.onShapeFilled}
            title="Riempie la forma invece di disegnarne solo il bordo"
          >
            Pieno
          </ToggleLabel>
        )}

        {props.pro && MIRROR_TOOLS.has(props.tool) && (
          <div className="mirror-toggles option-group" role="group" aria-label="Simmetria">
            <span className="lbl">Simmetria</span>
            <ToggleLabel
              checked={props.mirror.x}
              onChange={(x) => props.onMirror({ ...props.mirror, x })}
              title="Specchia sinistra e destra"
            >
              <Glyph name="flipH" alone />
            </ToggleLabel>
            <ToggleLabel
              checked={props.mirror.y}
              onChange={(y) => props.onMirror({ ...props.mirror, y })}
              title="Specchia sopra e sotto"
            >
              <Glyph name="flipV" alone />
            </ToggleLabel>
          </div>
        )}

        {props.pro && (SELECTION_TOOLS.has(props.tool) || props.selection.active) && (
          <div className="selection-actions option-group" role="group" aria-label="Selezione">
            {(
              [
                ['all', 'Tutto', 'Seleziona tutto (Ctrl+A)', true],
                ['none', 'Deseleziona', 'Togli la selezione (Ctrl+D)', props.selection.active],
                ['copy', 'Copia', 'Copia (Ctrl+C)', props.selection.active],
                ['cut', 'Taglia', 'Taglia (Ctrl+X)', props.selection.active],
                ['paste', 'Incolla', 'Incolla (Ctrl+V)', props.selection.canPaste],
                [
                  'flipH',
                  <Glyph key="h" name="flipH" alone />,
                  'Rifletti orizzontalmente (Maiusc+H)',
                  true
                ],
                [
                  'flipV',
                  <Glyph key="v" name="flipV" alone />,
                  'Rifletti verticalmente (Maiusc+V)',
                  true
                ],
                [
                  'rotate',
                  <>
                    <Glyph name="reset" />
                    90°
                  </>,
                  'Ruota di 90° (Maiusc+R)',
                  true
                ],
                [
                  'delete',
                  'Elimina',
                  'Cancella i pixel selezionati (Canc)',
                  props.selection.active
                ],
                ['drop', 'Appoggia', 'Appoggia il pezzo spostato (Invio)', props.selection.floating]
              ] as const
            ).map(([action, label, title, enabled]) => (
              <button
                key={action}
                type="button"
                className="ore"
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
          <Segmented
            label="Modalità del secchiello"
            value={props.fillMode}
            onChange={props.onFillMode}
            options={[
              ['contiguous', 'Area', 'Solo i pixel uguali collegati a quello cliccato'],
              ['global', 'Globale', 'Tutti i pixel di quel colore nella texture']
            ]}
          />
        )}

        {props.tool === 'noise' && (
          <Segmented
            label="Intensità del rumore"
            value={props.noiseStrength}
            onChange={props.onNoiseStrength}
            options={[
              [
                'soft',
                'Leggero',
                'Le 3 tonalità centrali della rampa: una grana fine (pietra, legno)'
              ],
              ['full', 'Forte', 'Tutte le 5 tonalità, anche le più scure e chiare (ghiaia, terra)']
            ]}
          />
        )}

        {props.showTips && <span className="tool-tip muted">{active.tip}</span>}
      </div>
      {overflow.right && (
        <button
          type="button"
          className="ore ico"
          aria-label="Altre opzioni"
          onClick={() => scroll(240)}
        >
          <PixelIcon icon={CMD_ICONS.more} />
        </button>
      )}
    </div>
  )
}

/** Colors and shading ramp (or the value picker while painting a map channel), for the dock. */
export function ColorDock(props: EditorToolsProps): React.JSX.Element {
  return (
    <div className="color-dock">
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
    </div>
  )
}

/** The three parts side by side in the editor grid: rail, options bar, colors. */
export function EditorTools(props: EditorToolsProps): React.JSX.Element {
  return (
    <>
      <ToolRail {...props} />
      <ToolOptions {...props} />
      <ColorDock {...props} />
    </>
  )
}
