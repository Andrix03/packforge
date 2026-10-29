// "Title and loading screen": the textures the game shows before a world opens. The panorama (six
// faces, turning as in the game), the Minecraft logo and the Java Edition line, the Mojang Studios
// logo of the loading screen on its fixed background, and the splashes of the title screen.
// Vanilla's are shown as a reference only: "Create yours" starts a new texture of the same size.
import { useEffect, useRef, useState } from 'react'
import { tr } from '../../shared/i18n'
import { assetUrl } from '../../shared/ipc'
import type { AssetSources } from '../preview/modelSource'
import { Switch } from '../ui/components'
import { useEscape } from '../useEscape'
import { PanoramaView } from './PanoramaView'

const TITLE = 'assets/minecraft/textures/gui/title/'
const SPLASHES = 'assets/minecraft/texts/splashes.txt'
const FACES = [0, 1, 2, 3, 4, 5].map((i) => `${TITLE}background/panorama_${i}.png`)
const FACE_NAMES = [
  tr('Davanti'),
  tr('Destra'),
  tr('Dietro'),
  tr('Sinistra'),
  tr('Sopra'),
  tr('Sotto')
]
const LOADING_LOGO = `${TITLE}mojangstudios.png`
/** The loading screen background, fixed by the game (ARGB 255, 239, 50, 61; black when monochrome). */
const BRAND_RED = '#ef323d'

interface Props {
  sources: AssetSources
  canCreate: boolean
  /** Opens the pack's texture, or starts a new one with that path. */
  onOpen: (path: string) => void
  onClose: () => void
  /** Shown as the Schermate section instead of a modal (no backdrop, no close button). */
  embedded?: boolean
  /** False while the page is hidden: the turning panorama (WebGL) stops, the splashes stay. */
  active?: boolean
  /** The splashes can be written (a folder pack); defaults to `canCreate`. */
  canWrite?: boolean
}

export function TitleScreensDialog({
  sources,
  canCreate,
  onOpen,
  onClose,
  embedded = false,
  active = true,
  canWrite = canCreate
}: Props): React.JSX.Element {
  useEscape(onClose, !embedded)
  const urlOf = (path: string): string | null => {
    if (sources.pack.files.has(path))
      return assetUrl(sources.pack.base, path, sources.pack.versions[path] ?? 0)
    return sources.vanilla?.files.has(path) ? assetUrl(sources.vanilla.base, path) : null
  }
  const slot = (path: string, label: string): React.JSX.Element => (
    <TextureSlot
      key={path}
      label={label}
      url={urlOf(path)}
      fromPack={sources.pack.files.has(path)}
      canCreate={canCreate}
      onOpen={() => onOpen(path)}
    />
  )
  const body = (
    <>
      <h2>{tr('Titolo e caricamento')}</h2>
      <section className="title-section">
        <h3 className="ph">{tr('Panorama del titolo')}</h3>
        {active && <PanoramaView faces={FACES.map(urlOf)} />}
        <p className="muted small">
          {tr(
            'Sei facce di un cubo visto da dentro, che gira piano. Le facce vicine devono combaciare ai bordi; dalla 26.x vanilla le scarica il launcher, qui le vedi solo come riferimento.'
          )}
        </p>
        <div className="title-slots">{FACES.map((path, i) => slot(path, FACE_NAMES[i] ?? ''))}</div>
      </section>

      <section className="title-section">
        <h3 className="ph">{tr('Logo')}</h3>
        <div className="title-slots">
          {slot(`${TITLE}minecraft.png`, tr('Logo di Minecraft'))}
          {slot(`${TITLE}edition.png`, tr('Scritta Java Edition'))}
        </div>
      </section>

      <section className="title-section">
        <h3 className="ph">{tr('Schermata di caricamento')}</h3>
        <LoadingPreview url={urlOf(LOADING_LOGO)} />
        <div className="title-slots">{slot(LOADING_LOGO, tr('Logo Mojang Studios'))}</div>
        <p className="muted small">
          {tr(
            'Lo sfondo lo decide il gioco: rosso, o nero con l’opzione «Logo monocromatico». Il logo è diviso in due metà, una sopra l’altra nel file, affiancate sullo schermo.'
          )}
        </p>
      </section>

      <section className="title-section">
        <h3 className="ph">{tr('Frasi del titolo (splashes.txt)')}</h3>
        <SplashesEditor sources={sources} canCreate={canWrite} />
      </section>

      {!embedded && (
        <div className="row">
          <button type="button" className="primary" onClick={onClose}>
            {tr('Chiudi')}
          </button>
        </div>
      )}
    </>
  )
  if (embedded) {
    return (
      <section
        className="card embedded-dialog title-screens"
        aria-label={tr('Titolo e caricamento')}
      >
        {body}
      </section>
    )
  }
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="card modal title-screens"
        role="dialog"
        aria-label={tr('Titolo e caricamento')}
        onClick={(event) => event.stopPropagation()}
      >
        {body}
      </div>
    </div>
  )
}

function TextureSlot(props: {
  label: string
  url: string | null
  fromPack: boolean
  canCreate: boolean
  onOpen: () => void
}): React.JSX.Element {
  return (
    <div className="title-slot">
      <div className="title-thumb sunken">
        {props.url ? <img src={props.url} alt="" /> : <span className="muted small">–</span>}
      </div>
      <span className="small">{props.label}</span>
      <span className={props.fromPack ? 'small success' : 'muted small'}>
        {props.fromPack ? tr('dal tuo pack') : tr('vanilla, riferimento')}
      </span>
      {(props.fromPack || props.canCreate) && (
        <button type="button" className="small-button" onClick={props.onOpen}>
          {props.fromPack ? tr('Apri') : tr('Crea la tua')}
        </button>
      )}
    </div>
  )
}

/** The loading screen at GUI scale 1 of a 427×240 window, fitted to the dialog. */
function LoadingPreview({ url }: { url: string | null }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let cancelled = false
    const width = canvas.width
    const height = canvas.height
    // The game's layout (LoadingOverlay): logo 4 units wide per unit of height, centred.
    const unit = Math.min(width * 0.75, height) * 0.25
    const half = Math.trunc(unit * 4 * 0.5)
    const cx = Math.trunc(width * 0.5)
    const cy = Math.trunc(height * 0.5)
    const draw = (image: HTMLImageElement | null): void => {
      if (cancelled) return
      ctx.imageSmoothingEnabled = true
      ctx.fillStyle = dark ? '#000000' : BRAND_RED
      ctx.fillRect(0, 0, width, height)
      if (image) {
        const halfRows = image.height / 2
        ctx.drawImage(image, 0, 0, image.width, halfRows, cx - half, cy - unit / 2, half, unit)
        ctx.drawImage(image, 0, halfRows, image.width, halfRows, cx, cy - unit / 2, half, unit)
      }
      // The progress bar under the logo.
      const barY = Math.trunc(height * 0.8325)
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1
      ctx.strokeRect(cx - half + 0.5, barY + 0.5, half * 2 - 1, 9)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(cx - half + 2, barY + 2, Math.trunc((half * 2 - 4) * 0.6), 6)
    }
    if (!url) {
      draw(null)
      return
    }
    const image = new Image()
    image.src = url
    void image
      .decode()
      .then(() => draw(image))
      .catch(() => draw(null))
    return () => {
      cancelled = true
    }
  }, [url, dark])
  return (
    <div className="title-loading">
      <canvas ref={ref} className="title-loading-canvas" width={427} height={240} />
      <div className="row">
        <Switch checked={dark} onChange={setDark} label={tr('Sfondo nero (logo monocromatico)')} />
        <span className="small">{tr('Sfondo nero (logo monocromatico)')}</span>
      </div>
    </div>
  )
}

/** The pack's splashes.txt: one line each, replacing all of vanilla's. */
function SplashesEditor({ sources, canCreate }: { sources: AssetSources; canCreate: boolean }) {
  const has = sources.pack.files.has(SPLASHES)
  const url = has
    ? assetUrl(sources.pack.base, SPLASHES, sources.pack.versions[SPLASHES] ?? 0)
    : null
  const [loaded, setLoaded] = useState<{ url: string | null; text: string } | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  // What was just saved: shown while the pack is read again (the file changed, so its URL did).
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (!url) return
    void fetch(url, { cache: 'no-store' })
      .then((r) => r.text())
      .then((text) => !cancelled && setLoaded({ url, text }))
      .catch(() => !cancelled && setLoaded({ url, text: '' }))
    return () => {
      cancelled = true
    }
  }, [url])
  const saved =
    url === null ? (justSaved ?? '') : loaded?.url === url ? loaded.text : (justSaved ?? null)
  const text = draft ?? saved ?? ''
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '').length

  async function save(): Promise<void> {
    setSaving(true)
    const result = await window.api.invoke('pack:saveSplashes', text)
    setSaving(false)
    if (result.ok) {
      setJustSaved(text.trim() === '' ? '' : text)
      setDraft(null)
      setStatus(tr('Salvate.'))
    } else setStatus(result.error)
  }

  return (
    <div className="title-splashes">
      <p className="muted small">
        {tr(
          'Una frase per riga: il gioco ne pesca una a caso. Le frasi del tuo pack sostituiscono tutte quelle di vanilla; lascia vuoto per tornare a quelle.'
        )}
      </p>
      <textarea
        value={text}
        rows={6}
        disabled={!canCreate || saved === null}
        spellCheck={false}
        aria-label={tr('Frasi del titolo')}
        onChange={(event) => {
          setDraft(event.target.value)
          setStatus(null)
        }}
      />
      <div className="row">
        <span className="small">{tr('{0} frasi', lines)}</span>
        {canCreate && (
          <button
            type="button"
            className="small-button"
            disabled={draft === null || saving}
            onClick={() => void save()}
          >
            {saving ? tr('Salvataggio…') : tr('Salva le frasi')}
          </button>
        )}
        {status && <span className="small">{status}</span>}
      </div>
    </div>
  )
}
