import { tr } from './i18n'
// Minimal PNG header reading (no decoding): signature + IHDR size.

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)
}

/** Width/height from the IHDR chunk, or null if this is not a well-formed PNG header. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null {
  // Signature (8) + chunk length (4) + "IHDR" (4) + width (4) + height (4).
  if (bytes.length < 24 || !isPng(bytes)) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const type = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!)
  if (view.getUint32(8) !== 13 || type !== 'IHDR') return null
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width > 0 && height > 0 ? { width, height } : null
}

export const ICON_MIN_SIZE = 16
export const ICON_MAX_SIZE = 1024
export const ICON_MAX_BYTES = 4 * 1024 * 1024

/** Validates bytes meant for pack.png. Returns an Italian error or null. */
export function validatePackIcon(bytes: Uint8Array): string | null {
  if (bytes.length > ICON_MAX_BYTES) return tr("L'icona è troppo grande (massimo 4 MB).")
  const size = readPngSize(bytes)
  if (!size) return tr("L'icona non è un PNG valido.")
  if (size.width !== size.height) return tr("L'icona deve essere quadrata.")
  if (size.width < ICON_MIN_SIZE || size.width > ICON_MAX_SIZE) {
    return tr("L'icona deve misurare tra {0} e {1} pixel di lato.", ICON_MIN_SIZE, ICON_MAX_SIZE)
  }
  return null
}
