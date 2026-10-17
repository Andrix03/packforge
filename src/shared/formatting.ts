// Legacy `§` formatting codes (Java Edition).
// Source: https://minecraft.wiki/w/Formatting_codes, verified 2026-10-18.
// Not stated by the wiki, so approximated here: unknown codes are consumed
// silently, codes are matched case-insensitively.

export const SECTION_SIGN = '§'

export interface ColorCode {
  code: string
  /** Java name, e.g. `dark_red`. */
  name: string
  /** Italian label for the UI. */
  label: string
  hex: string
}

export const COLOR_CODES: readonly ColorCode[] = [
  { code: '0', name: 'black', label: 'Nero', hex: '#000000' },
  { code: '1', name: 'dark_blue', label: 'Blu scuro', hex: '#0000AA' },
  { code: '2', name: 'dark_green', label: 'Verde scuro', hex: '#00AA00' },
  { code: '3', name: 'dark_aqua', label: 'Ciano scuro', hex: '#00AAAA' },
  { code: '4', name: 'dark_red', label: 'Rosso scuro', hex: '#AA0000' },
  { code: '5', name: 'dark_purple', label: 'Viola scuro', hex: '#AA00AA' },
  { code: '6', name: 'gold', label: 'Oro', hex: '#FFAA00' },
  { code: '7', name: 'gray', label: 'Grigio', hex: '#AAAAAA' },
  { code: '8', name: 'dark_gray', label: 'Grigio scuro', hex: '#555555' },
  { code: '9', name: 'blue', label: 'Blu', hex: '#5555FF' },
  { code: 'a', name: 'green', label: 'Verde', hex: '#55FF55' },
  { code: 'b', name: 'aqua', label: 'Azzurro', hex: '#55FFFF' },
  { code: 'c', name: 'red', label: 'Rosso', hex: '#FF5555' },
  { code: 'd', name: 'light_purple', label: 'Rosa', hex: '#FF55FF' },
  { code: 'e', name: 'yellow', label: 'Giallo', hex: '#FFFF55' },
  { code: 'f', name: 'white', label: 'Bianco', hex: '#FFFFFF' }
]

export type FormatFlag = 'obfuscated' | 'bold' | 'strikethrough' | 'underlined' | 'italic'

export const FORMAT_CODES: ReadonlyArray<{ code: string; flag: FormatFlag; label: string }> = [
  { code: 'l', flag: 'bold', label: 'Grassetto' },
  { code: 'o', flag: 'italic', label: 'Corsivo' },
  { code: 'n', flag: 'underlined', label: 'Sottolineato' },
  { code: 'm', flag: 'strikethrough', label: 'Barrato' },
  { code: 'k', flag: 'obfuscated', label: 'Offuscato' }
]

export const RESET_CODE = 'r'

export interface TextStyle {
  /** Hex color, or null for the context's default color. */
  color: string | null
  bold: boolean
  italic: boolean
  underlined: boolean
  strikethrough: boolean
  obfuscated: boolean
}

export interface StyledSegment {
  text: string
  style: TextStyle
}

const PLAIN: TextStyle = Object.freeze({
  color: null,
  bold: false,
  italic: false,
  underlined: false,
  strikethrough: false,
  obfuscated: false
})

const COLOR_BY_CODE = new Map(COLOR_CODES.map((c) => [c.code, c.hex]))
const FLAG_BY_CODE = new Map(FORMAT_CODES.map((f) => [f.code, f.flag]))

/**
 * Splits text with `§` codes into styled segments. A color code resets all
 * formatting (as in Java Edition); `§r` resets everything.
 */
export function parseFormattedText(text: string): StyledSegment[] {
  const segments: StyledSegment[] = []
  let style: TextStyle = { ...PLAIN }
  let buffer = ''

  const flush = (): void => {
    if (buffer === '') return
    const last = segments.at(-1)
    if (last && sameStyle(last.style, style)) last.text += buffer
    else segments.push({ text: buffer, style: { ...style } })
    buffer = ''
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string
    if (char !== SECTION_SIGN) {
      buffer += char
      continue
    }
    const code = text[i + 1]?.toLowerCase()
    i++ // The code character is consumed even when unknown.
    if (code === undefined) break
    flush()
    const color = COLOR_BY_CODE.get(code)
    const flag = FLAG_BY_CODE.get(code)
    if (color) style = { ...PLAIN, color }
    else if (flag) style = { ...style, [flag]: true }
    else if (code === RESET_CODE) style = { ...PLAIN }
  }
  flush()
  return segments
}

/** Text without any `§` codes. */
export function stripFormatting(text: string): string {
  return parseFormattedText(text)
    .map((segment) => segment.text)
    .join('')
}

/**
 * Inserts a code at the selection. With a non-empty selection the code is
 * placed before it and `§r` after it, so only the selection is styled.
 * Returns the new text and caret position.
 */
export function insertCode(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  code: string
): { text: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd, text.length))
  const end = Math.min(text.length, Math.max(selectionStart, selectionEnd))
  const open = SECTION_SIGN + code
  if (start === end) {
    return { text: text.slice(0, start) + open + text.slice(end), caret: start + open.length }
  }
  const close = SECTION_SIGN + RESET_CODE
  const next = text.slice(0, start) + open + text.slice(start, end) + close + text.slice(end)
  return { text: next, caret: end + open.length + close.length }
}

function sameStyle(a: TextStyle, b: TextStyle): boolean {
  return (
    a.color === b.color &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underlined === b.underlined &&
    a.strikethrough === b.strikethrough &&
    a.obfuscated === b.obfuscated
  )
}
