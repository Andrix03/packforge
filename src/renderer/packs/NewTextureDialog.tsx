import { useEffect, useState } from 'react'
import {
  createTexturePixels,
  sizeOptions,
  type TextureSize,
  validateTextureFolder,
  validateTextureName,
  type TextureStart
} from '../editor/newTexture'
import { fromHex, toHex, type Rgba } from '../editor/pixels'
import { decodePng } from '../../shared/pngCodec'
import { useEscape } from '../useEscape'
import { useSingleFlight } from '../useSingleFlight'
import { tr } from '../../shared/i18n'

export interface NewTextureRequest {
  folder: string
  name: string
  /** True when the user started from a vanilla texture (only its path is reused). */
  fromVanilla: boolean
  /** A texture of the pack to offer as the starting point (e.g. the previous growth stage). */
  copyFrom?: { path: string; url: string } | null
  /** The vanilla texture it replaces: only its size is read, to offer the same shape. */
  vanillaUrl?: string | null
}

const STARTS: Array<{ value: TextureStart; label: string; hint: string }> = [
  {
    value: 'noise',
    label: tr('Rumore'),
    hint: tr('Tonalità casuali del colore: base per pietra, terra, ghiaia')
  },
  { value: 'color', label: tr('Colore pieno'), hint: tr('Tutta del colore scelto') },
  { value: 'empty', label: tr('Vuota'), hint: tr('Trasparente: per foglie, fiori, vetro') }
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
  const [size, setSize] = useState<TextureSize>({ width: 16, height: 16 })
  const vanillaSize = useImageSize(request.vanillaUrl ?? null)
  const options = sizeOptions(vanillaSize)
  // The chosen size, else the vanilla one, else the first offered.
  const same = (a: TextureSize, b: TextureSize | null): boolean =>
    b !== null && a.width === b.width && a.height === b.height
  const chosen =
    options.find((o) => same(o, size)) ??
    options.find((o) => same(o, vanillaSize)) ??
    options[0] ??
    size
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
    (existing.has(path) ? tr('Questa texture esiste già nel pack: aprila dalla griglia.') : null)

  const create = useSingleFlight(async (): Promise<void> => {
    if (problem) return
    setBusy(true)
    setError(null)
    try {
      let image: { width: number; height: number; rgba: Uint8Array } = {
        width: chosen.width,
        height: chosen.height,
        rgba: new Uint8Array()
      }
      if (start === 'copy' && copyFrom) {
        // Only a texture of the pack is copied (never a vanilla one).
        const response = await fetch(copyFrom.url, { cache: 'no-store' })
        const decoded = decodePng(new Uint8Array(await response.arrayBuffer()))
        if (!decoded.ok) throw new Error(tr('Non riesco a leggere {0}.', copyFrom.path))
        const { width, height, data } = decoded.image
        image = { width, height, rgba: new Uint8Array(data) }
      } else if (start !== 'copy') {
        image.rgba = createTexturePixels(chosen, start, color)
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
  })

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form
        className="card modal form"
        role="dialog"
        aria-label={tr('Nuova texture')}
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault()
          create()
        }}
      >
        <h2>{tr('Nuova texture')}</h2>
        {request.fromVanilla && (
          <p className="muted small">
            {tr(
              'Stesso nome della texture vanilla, così la sostituisce nel gioco. I pixel partono da zero: la texture vanilla resta solo un riferimento.'
            )}
          </p>
        )}
        <label>
          {tr('Cartella')}
          <input
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            spellCheck={false}
          />
        </label>
        <label>
          {tr('Nome (senza .png)')}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            spellCheck={false}
            autoFocus
          />
        </label>
        {copyFrom && (
          <p className="muted small">
            {tr(
              '«Copia» parte da {0} del tuo pack: ritocchi solo quello che cambia crescendo.',
              copyFrom.path.slice(copyFrom.path.lastIndexOf('/') + 1)
            )}
          </p>
        )}
        <div className="field" hidden={start === 'copy'}>
          {tr('Dimensione')}
          <div className="tabs small-tabs" role="radiogroup" aria-label={tr('Dimensione')}>
            {options.map((value) => {
              const on = value.width === chosen.width && value.height === chosen.height
              // ×1, ×2, ×4 of the vanilla size, or of 16 for the usual squares.
              const factor = vanillaSize ? value.width / vanillaSize.width : value.width / 16
              return (
                <button
                  key={`${value.width}x${value.height}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={on ? 'tab active' : 'tab'}
                  onClick={() => setSize(value)}
                  title={
                    factor === 1
                      ? tr('Come le texture vanilla')
                      : tr('{0}× la risoluzione vanilla', factor ?? 1)
                  }
                >
                  {value.width}×{value.height}
                </button>
              )
            })}
          </div>
        </div>
        <div className="field">
          {tr('Si parte da')}
          <div className="tabs small-tabs" role="radiogroup" aria-label={tr('Punto di partenza')}>
            {copyFrom && (
              <button
                type="button"
                role="radio"
                aria-checked={start === 'copy'}
                className={start === 'copy' ? 'tab active' : 'tab'}
                onClick={() => setStart('copy')}
                title={tr('Copia di {0} (stessa dimensione)', copyFrom.path)}
              >
                {tr('Copia dello stadio prima')}
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
            {tr('Colore di base {0}', toHex(color))}
          </label>
        )}
        <p className="muted small path">{path}</p>
        {(problem ?? error) && <p className="field-error small">{problem ?? error}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={busy || problem !== null}>
            {busy ? tr('Creazione…') : tr('Crea e apri nell’editor')}
          </button>
          <button type="button" onClick={onCancel}>
            {tr('Annulla')}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Natural size of an image (only its size: the pixels are never read), null while loading. */
function useImageSize(url: string | null): TextureSize | null {
  const [loaded, setLoaded] = useState<{ url: string; size: TextureSize } | null>(null)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    const image = new Image()
    image.src = url
    void image
      .decode()
      .then(() => {
        if (!cancelled)
          setLoaded({ url, size: { width: image.naturalWidth, height: image.naturalHeight } })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [url])
  return loaded?.url === url ? loaded.size : null
}
