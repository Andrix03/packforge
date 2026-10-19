import { useState } from 'react'
import {
  createTexturePixels,
  TEXTURE_SIZES,
  validateTextureFolder,
  validateTextureName,
  type TextureStart
} from '../editor/newTexture'
import { fromHex, toHex, type Rgba } from '../editor/pixels'
import { decodePng } from '../../shared/pngCodec'
import { useEscape } from '../useEscape'

export interface NewTextureRequest {
  folder: string
  name: string
  /** True when the user started from a vanilla texture (only its path is reused). */
  fromVanilla: boolean
  /** A texture of the pack to offer as the starting point (e.g. the previous growth stage). */
  copyFrom?: { path: string; url: string } | null
}

const STARTS: Array<{ value: TextureStart; label: string; hint: string }> = [
  {
    value: 'noise',
    label: 'Rumore',
    hint: 'Tonalità casuali del colore: base per pietra, terra, ghiaia'
  },
  { value: 'color', label: 'Colore pieno', hint: 'Tutta del colore scelto' },
  { value: 'empty', label: 'Vuota', hint: 'Trasparente: per foglie, fiori, vetro' }
]

/**
 * Creates a new PNG in the pack and hands its path back. Starting from a vanilla texture reuses
 * only its folder and name: the pixels are generated here, never copied from the game.
 */
export function NewTextureDialog({
  request,
  existing,
  onCancel,
  onCreated
}: {
  request: NewTextureRequest
  /** Pack-relative paths already in the pack. */
  existing: ReadonlySet<string>
  onCancel: () => void
  onCreated: (path: string) => void
}): React.JSX.Element {
  const [folder, setFolder] = useState(request.folder)
  const [name, setName] = useState(request.name)
  const [size, setSize] = useState<number>(16)
  const copyFrom = request.copyFrom ?? null
  const [start, setStart] = useState<TextureStart | 'copy'>(copyFrom ? 'copy' : 'noise')
  const [color, setColor] = useState<Rgba>([127, 127, 127, 255])
  const [busy, setBusy] = useState(false)
  useEscape(onCancel, !busy)
  const [error, setError] = useState<string | null>(null)

  const path = `${folder.replace(/\/+$/, '')}/${name}.png`
  const problem =
    validateTextureFolder(folder.replace(/\/+$/, '')) ??
    validateTextureName(name) ??
    (existing.has(path) ? 'Questa texture esiste già nel pack: aprila dalla griglia.' : null)

  async function create(): Promise<void> {
    if (problem) return
    setBusy(true)
    setError(null)
    try {
      let image: { width: number; height: number; rgba: Uint8Array } = {
        width: size,
        height: size,
        rgba: new Uint8Array()
      }
      if (start === 'copy' && copyFrom) {
        // Only a texture of the pack is copied (never a vanilla one).
        const response = await fetch(copyFrom.url, { cache: 'no-store' })
        const decoded = decodePng(new Uint8Array(await response.arrayBuffer()))
        if (!decoded.ok) throw new Error(`Non riesco a leggere ${copyFrom.path}.`)
        const { width, height, data } = decoded.image
        image = { width, height, rgba: new Uint8Array(data) }
      } else if (start !== 'copy') {
        image.rgba = createTexturePixels(size, start, color)
      }
      const result = await window.api.invoke(
        'texture:save',
        path,
        image.width,
        image.height,
        image.rgba
      )
      if (result.ok) onCreated(path)
      else setError(result.error)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="card modal form"
        role="dialog"
        aria-label="Nuova texture"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <h2>Nuova texture</h2>
        {request.fromVanilla && (
          <p className="muted small">
            Stesso nome della texture vanilla, così la sostituisce nel gioco. I pixel partono da
            zero: la texture vanilla resta solo un riferimento.
          </p>
        )}
        <label>
          Cartella
          <input
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            spellCheck={false}
          />
        </label>
        <label>
          Nome (senza .png)
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            spellCheck={false}
            autoFocus
          />
        </label>
        {copyFrom && (
          <p className="muted small">
            «Copia» parte da {copyFrom.path.slice(copyFrom.path.lastIndexOf('/') + 1)} del tuo pack:
            ritocchi solo quello che cambia crescendo.
          </p>
        )}
        <div className="field" hidden={start === 'copy'}>
          Dimensione
          <div className="tabs small-tabs" role="radiogroup" aria-label="Dimensione">
            {TEXTURE_SIZES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={size === value}
                className={size === value ? 'tab active' : 'tab'}
                onClick={() => setSize(value)}
                title={
                  value === 16 ? 'Come le texture vanilla' : `${value / 16}× la risoluzione vanilla`
                }
              >
                {value}×{value}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          Si parte da
          <div className="tabs small-tabs" role="radiogroup" aria-label="Punto di partenza">
            {copyFrom && (
              <button
                type="button"
                role="radio"
                aria-checked={start === 'copy'}
                className={start === 'copy' ? 'tab active' : 'tab'}
                onClick={() => setStart('copy')}
                title={`Copia di ${copyFrom.path} (stessa dimensione)`}
              >
                Copia dello stadio prima
              </button>
            )}
            {STARTS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={start === option.value}
                className={start === option.value ? 'tab active' : 'tab'}
                onClick={() => setStart(option.value)}
                title={option.hint}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {start !== 'empty' && start !== 'copy' && (
          <label className="inline-check">
            <input
              type="color"
              value={toHex(color)}
              onChange={(event) => {
                const parsed = fromHex(event.target.value)
                if (parsed) setColor(parsed)
              }}
            />
            Colore di base {toHex(color)}
          </label>
        )}
        <p className="muted small path">{path}</p>
        {(problem ?? error) && <p className="field-error small">{problem ?? error}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={busy || problem !== null}>
            {busy ? 'Creazione…' : 'Crea e apri nell’editor'}
          </button>
          <button type="button" onClick={onCancel}>
            Annulla
          </button>
        </div>
      </form>
    </div>
  )
}
