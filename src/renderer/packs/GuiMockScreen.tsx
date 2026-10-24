// The GUI tab's preview: a mock game screen (main menu, HUD, inventory) drawn with the pack's GUI
// textures where it has them and vanilla's elsewhere. Like the game, a sprite's scaling comes from
// the .png.mcmeta of the same source as its image: a pack button without one is stretched.
import { useEffect, useMemo, useRef, useState } from 'react'
import { parseGuiScaling, type GuiScaling } from '../../shared/guiScaling'
import {
  MOCK_SCREENS,
  mockScreen,
  mockScreenPaths,
  type MockImage,
  type MockScreen,
  type MockScreenKind
} from '../../shared/guiMockScreens'
import { tr } from '../../shared/i18n'
import { assetUrl } from '../../shared/ipc'
import type { AssetSources } from '../preview/modelSource'
import { drawSprite } from '../preview/guiDraw'
import { Glyph, OreButton } from '../ui/components'
import { useEscape } from '../useEscape'

interface Loaded {
  image: HTMLImageElement
  scaling: GuiScaling
  fromPack: boolean
}

const SCREEN_NAMES: Record<MockScreenKind, string> = {
  title: tr('Menu principale'),
  hud: tr('HUD'),
  inventory: tr('Inventario')
}

export function GuiMockScreen({
  sources,
  onOpenTitle
}: {
  sources: AssetSources
  /** Opens the title and loading screen window. */
  onOpenTitle: () => void
}): React.JSX.Element {
  const splash = usePackSplash(sources)
  const [kind, setKind] = useState<MockScreenKind>('title')
  const [big, setBig] = useState<number | null>(null)
  useEscape(() => setBig(null), big !== null)
  const screen = useMemo(
    () =>
      mockScreen(kind, {
        singleplayer: tr('Giocatore singolo'),
        multiplayer: tr('Multigiocatore'),
        realms: tr('Minecraft Realms'),
        options: tr('Opzioni…'),
        quit: tr('Esci dal gioco'),
        inventory: tr('Fabbricazione'),
        splash: splash ?? tr('Fatto con PackForge!'),
        version: 'Minecraft'
      }),
    [kind, splash]
  )
  const loaded = useTextures(sources, screen)

  const fromPack = [...loaded.values()].filter((t) => t.fromPack).length
  return (
    <section className="card gui-mock" aria-label={tr('Schermata di prova')}>
      <div className="gui-preview-head">
        <span className="lbl">{tr('Schermata di prova')}</span>
        <OreButton onClick={() => setBig(2)} title={tr('La schermata a scala GUI vera, 2× o 3×')}>
          <Glyph name="resize" />
          {tr('Ingrandisci')}
        </OreButton>
      </div>
      <div className="row wrap" role="radiogroup" aria-label={tr('Schermata')}>
        {MOCK_SCREENS.map((k) => (
          <OreButton
            key={k}
            role="radio"
            aria-checked={kind === k}
            on={kind === k}
            onClick={() => setKind(k)}
          >
            {SCREEN_NAMES[k]}
          </OreButton>
        ))}
      </div>
      <div className="gui-mock-stage sunken">
        {/* Drawn at 2× and fitted to the column: pixels stay square enough to judge colours. */}
        <MockCanvas screen={screen} loaded={loaded} scale={2} kind={kind} fit />
      </div>
      <button type="button" className="small-button" onClick={onOpenTitle}>
        <Glyph name="book" />
        {tr('Titolo e caricamento…')}
      </button>
      {big !== null && (
        <div className="modal-backdrop" role="presentation" onClick={() => setBig(null)}>
          <div
            className="card modal gui-mock-big"
            role="dialog"
            aria-label={tr('Schermata di prova')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="gui-preview-head">
              <h2>{SCREEN_NAMES[kind]}</h2>
              <div className="row" role="radiogroup" aria-label={tr('Scala GUI')}>
                {[2, 3].map((s) => (
                  <OreButton
                    key={s}
                    role="radio"
                    aria-checked={big === s}
                    on={big === s}
                    onClick={() => setBig(s)}
                  >
                    {s}×
                  </OreButton>
                ))}
                <button type="button" className="small-button" onClick={() => setBig(null)}>
                  {tr('Chiudi')}
                </button>
              </div>
            </div>
            <div className="gui-mock-big-stage">
              <MockCanvas screen={screen} loaded={loaded} scale={big} kind={kind} fit={false} />
            </div>
          </div>
        </div>
      )}
      <p className="muted small">
        {tr(
          'Dal tuo pack: {0} di {1} texture, il resto da vanilla. Posizioni approssimate.',
          fromPack,
          loaded.size
        )}
      </p>
    </section>
  )
}

function MockCanvas(props: {
  screen: MockScreen
  loaded: ReadonlyMap<string, Loaded>
  scale: number
  kind: MockScreenKind
  fit: boolean
}): React.JSX.Element {
  const { screen, loaded, scale } = props
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (const item of screen.items) {
      if (item.kind === 'fill') {
        ctx.fillStyle = item.color
        ctx.fillRect(item.x * scale, item.y * scale, item.width * scale, item.height * scale)
      } else if (item.kind === 'text') {
        drawText(
          ctx,
          item.text,
          item.x,
          item.y,
          item.color,
          item.align,
          item.shadow,
          scale,
          item.rotate
        )
      } else {
        const texture = loaded.get(item.path)
        if (texture) drawImageItem(ctx, item, texture, scale)
      }
    }
  }, [screen, loaded, scale])
  return (
    <canvas
      ref={ref}
      className={props.fit ? 'gui-sprite gui-mock-fit' : 'gui-sprite'}
      data-screen={props.kind}
      width={screen.width * scale}
      height={screen.height * scale}
    />
  )
}

/** The first line of the pack's splashes.txt (the game picks one at random), or null. */
function usePackSplash(sources: AssetSources): string | null {
  const path = 'assets/minecraft/texts/splashes.txt'
  const url = sources.pack.files.has(path)
    ? assetUrl(sources.pack.base, path, sources.pack.versions[path] ?? 0)
    : null
  const [loaded, setLoaded] = useState<{ url: string; line: string | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    void fetch(url, { cache: 'no-store' })
      .then((r) => r.text())
      .then((text) => {
        const line = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? null
        if (!cancelled) setLoaded({ url, line })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [url])
  return url && loaded?.url === url ? loaded.line : null
}

/** Images and scalings of a screen, each from the pack when it has the image, else vanilla. */
function useTextures(sources: AssetSources, screen: MockScreen): ReadonlyMap<string, Loaded> {
  const [state, setState] = useState<{ key: string; map: ReadonlyMap<string, Loaded> }>({
    key: '',
    map: new Map()
  })
  const paths = mockScreenPaths(screen)
  const key = `${sources.pack.base}|${sources.vanilla?.base ?? ''}|${paths
    .map(
      (p) =>
        `${p}:${sources.pack.files.has(p) ? (sources.pack.versions[p] ?? 0) : 'v'}:${sources.pack.versions[`${p}.mcmeta`] ?? 0}`
    )
    .join(',')}`
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const map = new Map<string, Loaded>()
      await Promise.all(
        paths.map(async (path) => {
          const fromPack = sources.pack.files.has(path)
          const base = fromPack
            ? sources.pack.base
            : sources.vanilla?.files.has(path)
              ? sources.vanilla.base
              : null
          if (!base) return
          const files = fromPack
            ? sources.pack.files
            : (sources.vanilla?.files ?? new Set<string>())
          const version = fromPack ? (sources.pack.versions[path] ?? 0) : 0
          const image = new Image()
          image.src = assetUrl(base, path, version)
          const decoded = await image
            .decode()
            .then(() => true)
            .catch(() => false)
          if (!decoded) return
          // The scaling comes from the same source as the image (the game's rule).
          let scaling: GuiScaling = { type: 'stretch' }
          if (files.has(`${path}.mcmeta`)) {
            const json: unknown = await fetch(
              assetUrl(
                base,
                `${path}.mcmeta`,
                fromPack ? (sources.pack.versions[`${path}.mcmeta`] ?? 0) : 0
              )
            )
              .then((r) => r.json())
              .catch(() => null)
            const parsed = parseGuiScaling(json)
            if (parsed.ok) scaling = parsed.scaling
          }
          map.set(path, { image, scaling, fromPack })
        })
      )
      if (!cancelled) setState({ key, map })
    })()
    return () => {
      cancelled = true
    }
    // `key` stands for sources and paths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state.map
}

function drawImageItem(
  ctx: CanvasRenderingContext2D,
  item: MockImage,
  texture: Loaded,
  scale: number
): void {
  const { image } = texture
  if (item.cover) {
    // Fill the screen, cropping the longer side of the image.
    const ratio = Math.max((item.width * scale) / image.width, (item.height * scale) / image.height)
    const w = image.width * ratio
    const h = image.height * ratio
    ctx.drawImage(image, (item.width * scale - w) / 2, (item.height * scale - h) / 2, w, h)
    return
  }
  if (item.region && item.textureSize) {
    const px = image.width / item.textureSize.width
    const r = item.region
    ctx.drawImage(
      image,
      r.x * px,
      r.y * px,
      r.width * px,
      r.height * px,
      item.x * scale,
      item.y * scale,
      item.width * scale,
      item.height * scale
    )
    return
  }
  drawSprite(ctx, image, texture.scaling, item.x, item.y, item.width, item.height, scale)
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  align: CanvasTextAlign,
  shadow: boolean,
  scale: number,
  rotate?: number
): void {
  ctx.save()
  ctx.font = `${8 * scale}px PixelOperator, monospace`
  ctx.textAlign = align
  ctx.textBaseline = 'top'
  ctx.translate(x * scale, y * scale)
  if (rotate) ctx.rotate((rotate * Math.PI) / 180)
  if (shadow) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.fillText(text, scale, scale)
  }
  ctx.fillStyle = color
  ctx.fillText(text, 0, 0)
  ctx.restore()
}
