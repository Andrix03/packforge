import { useRef } from 'react'
import {
  COLOR_CODES,
  FORMAT_CODES,
  insertCode,
  parseFormattedText,
  RESET_CODE,
  SECTION_SIGN
} from '../../shared/formatting'
import { tr } from '../../shared/i18n'

interface DescriptionEditorProps {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  autoFocus?: boolean
}

/** Text area with `§` code buttons and a live preview. */
export function DescriptionEditor({
  value,
  onChange,
  invalid = false,
  autoFocus = false
}: DescriptionEditorProps): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function insert(code: string): void {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? value.length
    const end = textarea?.selectionEnd ?? value.length
    const next = insertCode(value, start, end, code)
    onChange(next.text)
    // Restore focus and caret after React re-renders the new value.
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(next.caret, next.caret)
    })
  }

  return (
    <div className="description-editor">
      <div className="format-toolbar" role="toolbar" aria-label={tr('Codici di formattazione')}>
        {COLOR_CODES.map((color) => (
          <button
            key={color.code}
            type="button"
            className="swatch"
            style={{ background: color.hex }}
            title={`${color.label} (${SECTION_SIGN}${color.code})`}
            aria-label={color.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insert(color.code)}
          />
        ))}
        <span className="toolbar-gap" />
        {FORMAT_CODES.map((format) => (
          <button
            key={format.code}
            type="button"
            className={`format-button format-${format.flag}`}
            title={`${format.label} (${SECTION_SIGN}${format.code})`}
            aria-label={format.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insert(format.code)}
          >
            {format.code.toUpperCase()}
          </button>
        ))}
        <button
          type="button"
          className="format-button"
          title={tr('Reset ({0}{1})', SECTION_SIGN, RESET_CODE)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => insert(RESET_CODE)}
        >
          {tr('Reset')}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={2}
        placeholder={tr('Texture LabPBR 16x')}
        aria-invalid={invalid}
        autoFocus={autoFocus}
        spellCheck={false}
      />
      <div className="mc-preview" aria-label={tr('Anteprima')}>
        <McText text={value} placeholder={tr('Anteprima della descrizione')} />
      </div>
      <span className="muted small">
        {tr(
          'Anteprima approssimata: font e colore di base possono differire leggermente dal gioco. Un colore annulla grassetto/corsivo applicati prima: metti prima il colore, poi il formato.'
        )}
      </span>
    </div>
  )
}

/** Renders `§`-formatted text with Minecraft colors. */
export function McText({
  text,
  placeholder
}: {
  text: string
  placeholder?: string
}): React.JSX.Element {
  const segments = parseFormattedText(text)
  if (segments.length === 0) return <span className="muted">{placeholder ?? ''}</span>
  return (
    <span className="mc-text">
      {segments.map((segment, i) => {
        const { style } = segment
        const decorations = [
          style.underlined ? 'underline' : '',
          style.strikethrough ? 'line-through' : ''
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <span
            key={i}
            className={style.obfuscated ? 'mc-obfuscated' : undefined}
            style={{
              color: style.color ?? undefined,
              fontWeight: style.bold ? 700 : undefined,
              fontStyle: style.italic ? 'italic' : undefined,
              textDecoration: decorations || undefined
            }}
          >
            {segment.text}
          </span>
        )
      })}
    </span>
  )
}
