// Building blocks of the 12b interface (style in theme.css, approved on the design canvas).
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes
} from 'react'
import { GLYPHS, type GlyphName } from './glyphs'
import type { PixelIconData } from './icons'
import { pictureCss, type PixelPicture } from './pictures'
import { segThumbLeft } from './slider'

/** 16×16 two-tone pixel icon in currentColor (the shade at 45 %). Sizes: multiples of 16 only. */
export function PixelIcon({ icon, size = 16 }: { icon: PixelIconData; size?: 16 | 32 | 48 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {icon.b && <path d={icon.b} fill="currentColor" opacity={0.45} />}
      <path d={icon.a} fill="currentColor" />
    </svg>
  )
}

/**
 * Pixel glyph inline with text (in place of ✓, ▶, →, emoji…), in the text colour. Leaves a small
 * gap before the text that follows; `alone` when nothing follows (icon-only buttons, line end).
 */
export function Glyph({
  name,
  icon,
  alone
}: {
  name?: GlyphName
  icon?: PixelIconData
  alone?: boolean
}) {
  const data = icon ?? (name ? GLYPHS[name] : undefined)
  if (!data) return null
  return (
    <span className={alone ? 'glyph alone' : 'glyph'}>
      <PixelIcon icon={data} />
    </span>
  )
}

/** Small pixel picture (scene, material, size…) with the dark pixel outline. */
export function Picture({ picture, size = 18 }: { picture: PixelPicture; size?: number }) {
  return (
    <span
      className="picture"
      style={{ width: size, height: size, background: pictureCss(picture) }}
      aria-hidden="true"
    />
  )
}

type OreProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Active (green) state. */
  on?: boolean
  icon?: PixelIconData
  picture?: PixelPicture
  /** Taller button with a readable label next to a picture. */
  chip?: boolean
}

/** Light bevelled button; green when `on`. Icon-only buttons need an aria-label. */
export function OreButton({
  on,
  icon,
  picture,
  chip,
  className,
  children,
  type,
  ...rest
}: OreProps) {
  const cls = [on ? 'ore-on' : 'ore', chip && 'chip', icon && !children && 'ico', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type={type ?? 'button'}
      className={cls}
      aria-pressed={on === undefined ? undefined : on}
      {...rest}
    >
      {picture && <Picture picture={picture} />}
      {icon && <PixelIcon icon={icon} />}
      {children !== undefined && children !== null && <span>{children}</span>}
    </button>
  )
}

/** I/O switch (green "I" on the left when on, grey "O" on the right when off). */
export function Switch({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean | undefined
}) {
  return (
    <button
      type="button"
      className="sw"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      {checked ? (
        <>
          <span className="sw-i" />
          <span className="knob" />
        </>
      ) : (
        <>
          <span className="knob" />
          <span className="sw-o" />
        </>
      )}
    </button>
  )
}

/** Label with the small info marker: the note shows on hover or keyboard focus. */
export function InfoLabel({
  label,
  note,
  className = 'lbl'
}: {
  label: string
  note?: string | undefined
  className?: string
}) {
  if (!note) return <span className={className}>{label}</span>
  return (
    <span className="tipwrap">
      <span className={className}>{label}</span>
      <span className="tip" tabIndex={0} aria-label={note} />
      <span className="tipbox" role="tooltip">
        {note}
      </span>
    </span>
  )
}

/** Switch + label (+ hover note): the standard settings row. */
export function SwitchRow({
  checked,
  onChange,
  label,
  note,
  disabled
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  note?: string
  disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
      <InfoLabel label={label} note={note} />
    </div>
  )
}

/** Segmented slider: `steps` cells, value 0..steps; clicking a cell sets the value. */
export function SegSlider({
  label,
  value,
  steps,
  onChange,
  valueText,
  disabled
}: {
  label: string
  value: number
  steps: number
  onChange: (next: number) => void
  valueText?: string
  disabled?: boolean
}) {
  const cells: ReactNode[] = []
  for (let i = 1; i <= steps; i++) {
    cells.push(
      <button
        key={i}
        type="button"
        className={i <= value ? 'seg-cell on' : 'seg-cell'}
        aria-label={`${label} ${i}`}
        disabled={disabled}
        onClick={() => onChange(i)}
      />
    )
  }
  return (
    <div
      className="raised"
      style={{ padding: '6px 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ display: 'flex' }}>
        <span className="lbl">{label}</span>
        <span style={{ flex: 1 }} />
        <span className="lbl">{valueText ?? String(value)}</span>
      </div>
      <div className="seg">
        <div className="seg-track">{cells}</div>
        <div className="seg-thumb" style={{ left: segThumbLeft(value, steps) }} />
      </div>
    </div>
  )
}

/** Dropdown in the ore style; `big` = Tiny5 at 15 px for values people must read. */
export function OreSelect({
  big,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { big?: boolean }) {
  return (
    <select
      className={['ore-select', big && 'big', className].filter(Boolean).join(' ')}
      {...rest}
    />
  )
}

/** Collapsible dock panel: raised header (▾/▸ + title + hint), body below. */
export function Panel({
  title,
  hint,
  open,
  onToggle,
  children
}: {
  title: string
  hint?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderBottom: '1px solid var(--ui-edge-dark)'
      }}
    >
      <button type="button" className="raised panel-head" aria-expanded={open} onClick={onToggle}>
        <span className="ph">
          <Glyph name={open ? 'caretDown' : 'caretRight'} />
          {title}
        </span>
        <span style={{ flex: 1 }} />
        {hint !== undefined && <span className="muted">{hint}</span>}
      </button>
      {open && <div className="panel-body">{children}</div>}
    </section>
  )
}

/**
 * Native range input drawn as a segmented slider: green up to the value, ore thumb. Still a real
 * <input type="range"> (keyboard, aria-label, tests); the fill comes from the --pct variable.
 */
export function RangeInput({ className, style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const min = Number(rest.min ?? 0)
  const max = Number(rest.max ?? 100)
  const value = Number(rest.value ?? rest.defaultValue ?? min)
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0
  return (
    <input
      type="range"
      className={['seg-range', className].filter(Boolean).join(' ')}
      style={{ ...style, ['--pct' as string]: `${pct}%` }}
      {...rest}
    />
  )
}

/**
 * A dialog's frame: a modal (backdrop + card) or, `embedded`, a panel of a screen (Pubblica shows
 * the export and the in-game copy side by side). Clicking the backdrop calls `onBackdrop`.
 */
export function DialogFrame({
  embedded,
  label,
  onBackdrop,
  children
}: {
  embedded: boolean
  label: string
  onBackdrop?: (() => void) | undefined
  children: ReactNode
}) {
  if (embedded) {
    return (
      <section className="card embedded-dialog batch" aria-label={label}>
        {children}
      </section>
    )
  }
  return (
    <div className="modal-backdrop" role="presentation" onClick={onBackdrop}>
      <div
        className="card modal batch"
        role="dialog"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
