// The editor's preview for item textures (`textures/item/…`), in place of the 3D block: the item
// drawn through its definition (`items/<name>.json`) as the game picks the models, in a display
// context (inventory, hand, ground, head, frame) and a state of its properties (a bow being
// pulled, the compass angle, a loaded crossbow…). The painted texture shows live. Without a
// definition (before 1.21.4, or a new item) the texture's own `item/<name>` model is drawn.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildQuads, type Quad } from '../../shared/blockGeometry'
import { namespaced, texturePath, type TextureRef } from '../../shared/blockModel'
import { tr } from '../../shared/i18n'
import { drawnModels, itemProperties, parseItemDefinition } from '../../shared/itemDefinition'
import { itemQuads, type DisplayTransform } from '../../shared/itemModel'
import {
  DISPLAY_CONTEXTS,
  itemNamesFor,
  itemTint,
  numberRange,
  resolveItemModel,
  selectValues,
  stateShowing,
  type ItemModelDraw,
  type ItemState
} from '../../shared/itemPreview'
import type { FormatRange } from '../../shared/modelRules'
import type { RgbaImage } from '../../shared/pngCodec'
import { loadPng } from '../packs/packFetch'
import { OreButton, RangeInput, SwitchRow } from '../ui/components'
import { resolveAssetUrl, type AssetSources } from './modelSource'
import { loadColormaps, type ColormapPixels } from './colormaps'
import { colormapPixel } from '../../shared/biomeTint'

interface Props {
  path: string
  canvas: HTMLCanvasElement | null
  revision: number
  sources: AssetSources
  range: FormatRange | null
}

const CONTEXT_LABELS: Record<(typeof DISPLAY_CONTEXTS)[number], () => string> = {
  gui: () => tr('Inventario'),
  firstperson_righthand: () => tr('Prima persona'),
  thirdperson_righthand: () => tr('Terza persona'),
  ground: () => tr('A terra'),
  head: () => tr('In testa'),
  fixed: () => tr('Cornice')
}

/** Where the camera starts for a context (the hand views turn the item edge-on to the front). */
const START_YAW: Record<(typeof DISPLAY_CONTEXTS)[number], number> = {
  gui: 0,
  firstperson_righthand: -1.1,
  thirdperson_righthand: -0.9,
  ground: 0.5,
  head: Math.PI,
  fixed: Math.PI
}

/** Every range above the newest known: definitions are read as the latest version does. */
const ANY_RANGE: FormatRange = { min: { major: 46, minor: 0 }, max: { major: 999, minor: 0 } }

async function loadJson(sources: AssetSources, path: string): Promise<unknown> {
  const url = resolveAssetUrl(sources, path)
  if (!url) return null
  try {
    return await (await fetch(url, { cache: 'no-store' })).json()
  } catch {
    return null
  }
}

function hasFile(sources: AssetSources, path: string): boolean {
  return sources.pack.files.has(path) || (sources.vanilla?.files.has(path) ?? false)
}

/** The item a texture belongs to: the first guessed name with a definition. */
function itemOf(sources: AssetSources, path: string): { name: string; ns: string } | null {
  const ns = /^assets\/([^/]+)\//.exec(path)?.[1] ?? 'minecraft'
  const name = itemNamesFor(path).find((n) => hasFile(sources, `assets/${ns}/items/${n}.json`))
  return name ? { name, ns } : null
}

function displayMatrix(display: DisplayTransform | undefined): THREE.Matrix4 {
  if (!display) return new THREE.Matrix4()
  const [rx, ry, rz] = display.rotation.map(THREE.MathUtils.degToRad) as [number, number, number]
  const [tx, ty, tz] = display.translation
  return new THREE.Matrix4().compose(
    new THREE.Vector3(tx / 16, ty / 16, tz / 16),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')),
    new THREE.Vector3(...display.scale)
  )
}

/** Rows of the first frame of an animated strip (square frames), else the whole height. */
function frameHeight(image: { width: number; height: number }): number {
  return image.height > image.width && image.height % image.width === 0 ? image.width : image.height
}

/** Quads as triangles, model space (0–16) to block units centred on 0. */
function geometryOf(quads: Quad[], frame: number): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const normals: number[] = []
  for (const quad of quads) {
    for (const i of [0, 3, 2, 0, 2, 1]) {
      const p = quad.positions[i]!
      positions.push(p[0] / 16 - 0.5, p[1] / 16 - 0.5, p[2] / 16 - 0.5)
      const uv = quad.uvs[i]!
      uvs.push(uv[0] / 16, (uv[1] / 16) * frame)
      normals.push(...quad.normal)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return geometry
}

export function ItemPreview(props: Props): React.JSX.Element {
  const { sources, path } = props
  const item = itemOf(sources, path)
  const definitionPath = item ? `assets/${item.ns}/items/${item.name}.json` : null
  const [definition, setDefinition] = useState<{ path: string; json: unknown } | null>(null)
  useEffect(() => {
    if (!definitionPath) return
    let current = true
    void loadJson(sources, definitionPath).then(
      (json) => current && setDefinition({ path: definitionPath, json })
    )
    return () => {
      current = false
    }
  }, [sources, definitionPath])
  const json = definition && definition.path === definitionPath ? definition.json : null
  const root = useMemo(
    () => (json ? parseItemDefinition(json, props.range ?? ANY_RANGE).root : null),
    [json, props.range]
  )
  const ownModel = namespaced(path.replace(/^assets\/([^/]+)\/textures\/(.+)\.png$/, '$1:$2'))

  const [context, setContext] = useState<string>('gui')
  // null = the first state that shows the painted texture (or the plain one).
  const [chosen, setChosen] = useState<ItemState | null>(null)
  const state: ItemState = chosen ??
    (root ? stateShowing(root, ownModel, context) : null) ?? {
      conditions: [],
      selects: {},
      numbers: {}
    }
  const properties = itemProperties(root)
  const drawn = root
    ? drawnModels(root, {
        displayContext: context,
        conditions: new Set(state.conditions),
        selects: state.selects,
        numbers: state.numbers
      })
    : [{ model: ownModel, tints: [] }]
  const modelIds = drawn.map((d) => d.model)
  const idsKey = JSON.stringify(drawn)

  const resolved = useResolvedModels(sources, modelIds)
  const models = drawn.flatMap((d) => {
    const model = resolved.get(d.model)
    return model ? [{ ...model, tints: d.tints }] : []
  })
  const colormaps = useColormaps(sources)
  const textureIds = [
    ...new Set(
      models.flatMap((m) => [
        ...(m.layers ?? []).map((l) => l.id),
        ...(m.elements?.elements ?? []).flatMap((e) =>
          Object.values(e.faces).flatMap((f) => (f?.texture ? [f.texture.id] : []))
        )
      ])
    )
  ]
  const sprites = useSprites(sources, textureIds, path)

  const ref = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<{ holder: THREE.Group; fit: (box: THREE.Box3) => void } | null>(null)
  const yaw = useRef(0)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 1.8))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(-0.3, 0.8, 1)
    scene.add(sun)
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
    const holder = new THREE.Group()
    scene.add(holder)
    let distance = 3
    sceneRef.current = {
      holder,
      fit: (box) => {
        const size = box.getSize(new THREE.Vector3()).length()
        distance = Math.max(0.5, size * 1.7)
      }
    }
    let frame = 0
    const draw = (): void => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== Math.round(width * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false)
        camera.aspect = width / Math.max(1, height)
        camera.updateProjectionMatrix()
      }
      camera.position.set(Math.sin(yaw.current) * distance, 0, Math.cos(yaw.current) * distance)
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      sceneRef.current = null
      renderer.dispose()
    }
  }, [])

  // The item: rebuilt when the models, the context or the painted pixels change.
  useEffect(() => {
    const target = sceneRef.current
    if (!target) return
    const disposables: Array<{ dispose(): void }> = []
    const item = new THREE.Group()
    const textures = new Map<string, THREE.Texture>()
    // The open texture: its painted pixels as they are now.
    const live = liveSprite(props.canvas)
    const spriteOf = (id: string): Sprite | undefined =>
      texturePath(id) === path ? (live ?? undefined) : sprites.get(id)
    const textureFor = (id: string): THREE.Texture | null => {
      const known = textures.get(id)
      if (known) return known
      const sprite = spriteOf(id)
      if (!sprite) return null
      const texture =
        sprite.kind === 'live'
          ? new THREE.CanvasTexture(sprite.canvas)
          : new THREE.DataTexture(
              sprite.image.data,
              sprite.image.width,
              sprite.image.height,
              THREE.RGBAFormat
            )
      texture.flipY = false
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.colorSpace = THREE.SRGBColorSpace
      texture.needsUpdate = true
      textures.set(id, texture)
      disposables.push(texture)
      return texture
    }
    const add = (
      group: THREE.Group,
      quads: Quad[],
      ref: TextureRef | null,
      layer: number,
      tint: number
    ): void => {
      const sprite = ref ? spriteOf(ref.id) : undefined
      const texture = ref ? textureFor(ref.id) : null
      if (!texture || !sprite || quads.length === 0) return
      const geometry = geometryOf(quads, frameHeight(sprite.size) / sprite.size.height)
      const material = new THREE.MeshLambertMaterial({
        map: texture,
        color: new THREE.Color().setRGB(
          ((tint >> 16) & 255) / 255,
          ((tint >> 8) & 255) / 255,
          (tint & 255) / 255,
          THREE.SRGBColorSpace
        ),
        alphaTest: 0.1,
        side: THREE.DoubleSide,
        // Later layers of a flat item lie on the same planes: drawn on top.
        polygonOffset: layer > 0,
        polygonOffsetFactor: -layer,
        polygonOffsetUnits: -layer
      })
      disposables.push(geometry, material)
      group.add(new THREE.Mesh(geometry, material))
    }
    for (const model of models) {
      const part = new THREE.Group()
      // Tint index → colour (white when the definition gives no tint for it).
      const tintOf = (index: number): number =>
        index < 0 ? 0xffffff : tintColor(model.tints[index], colormaps)
      if (model.layers) {
        // item/generated: layer i is drawn with tint index i.
        model.layers.forEach((layer, index) => {
          const sprite = spriteOf(layer.id)
          if (!sprite) return
          const { width } = sprite.size
          const height = frameHeight(sprite.size)
          const quads = itemQuads(width, height, sprite.alpha, layer)
          add(part, quads, layer, index, tintOf(index))
        })
      } else if (model.elements) {
        const groups = new Map<string, { id: string; tint: number; quads: Quad[] }>()
        for (const quad of buildQuads(model.elements, { x: 0, y: 0 })) {
          if (!quad.texture) continue
          const key = `${quad.texture.id}|${quad.tintIndex}`
          const group = groups.get(key) ?? { id: quad.texture.id, tint: quad.tintIndex, quads: [] }
          group.quads.push(quad)
          groups.set(key, group)
        }
        for (const { id, tint, quads } of groups.values()) {
          add(part, quads, { id, translucent: false }, 0, tintOf(tint))
        }
      }
      part.applyMatrix4(displayMatrix(model.display[context]))
      item.add(part)
    }
    // Centred whatever the context moves it to: the shape and angle matter here, not the place.
    const box = new THREE.Box3().setFromObject(item)
    if (!box.isEmpty()) {
      item.position.sub(box.getCenter(new THREE.Vector3()))
      target.fit(box)
    }
    target.holder.add(item)
    return () => {
      target.holder.remove(item)
      for (const d of disposables) d.dispose()
    }
    // `idsKey` stands for `models`; `revision` re-reads the painted pixels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, resolved, sprites, colormaps, context, props.revision, props.canvas, path])

  const builtin = models.some((m) => m.builtin)
  const update = (next: Partial<ItemState>): void => setChosen({ ...state, ...next })
  const drag = useRef<number | null>(null)
  return (
    <section className="item-preview card" aria-label={tr('Anteprima oggetto')}>
      <span className="lbl">{tr('Anteprima oggetto')}</span>
      <p className="muted small">
        {item
          ? tr('Come lo disegna il gioco con items/{0}.json.', item.name)
          : tr('Nessuna definizione in items/: mostro il modello {0}.', ownModel)}
      </p>
      <div className="row wrap" role="radiogroup" aria-label={tr('Dove')}>
        {DISPLAY_CONTEXTS.map((value) => (
          <OreButton
            key={value}
            role="radio"
            aria-checked={context === value}
            on={context === value}
            onClick={() => {
              setContext(value)
              yaw.current = START_YAW[value]
            }}
          >
            {CONTEXT_LABELS[value]()}
          </OreButton>
        ))}
      </div>
      <canvas
        ref={ref}
        className="item-view sunken"
        aria-label={tr('L’oggetto, trascina per girarlo')}
        onPointerDown={(event) => {
          drag.current = event.clientX
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (drag.current === null) return
          yaw.current += (event.clientX - drag.current) * 0.01
          drag.current = event.clientX
        }}
        onPointerUp={() => {
          drag.current = null
        }}
      />
      <p className="muted small" data-testid="item-models">
        {modelIds.length === 0
          ? tr('Niente da disegnare in questo stato.')
          : tr('Modelli: {0}', modelIds.map((id) => id.replace(/^minecraft:/, '')).join(', '))}
      </p>
      {builtin && (
        <p className="muted small">
          {tr('Parte dell’oggetto la disegna il gioco con il suo codice: qui non si vede.')}
        </p>
      )}
      {properties.conditions.map((property) => (
        <SwitchRow
          key={property}
          label={property}
          checked={state.conditions.includes(property)}
          onChange={(on) =>
            update({
              conditions: on
                ? [...state.conditions, property]
                : state.conditions.filter((c) => c !== property)
            })
          }
        />
      ))}
      {properties.selects
        .filter((property) => property !== 'display_context')
        .map((property) => (
          <label key={property} className="small select-field">
            {property === 'component' ? tr('Nome nell’incudine') : property}{' '}
            <select
              value={state.selects[property] ?? ''}
              onChange={(event) => {
                const selects = { ...state.selects }
                if (event.target.value === '') delete selects[property]
                else selects[property] = event.target.value
                update({ selects })
              }}
            >
              <option value="">{tr('Altro')}</option>
              {selectValues(root, property).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        ))}
      {properties.numbers.map((property) => {
        const span = numberRange(root, property)
        const value = state.numbers[property] ?? 0
        return (
          <label key={property} className="item-number small">
            <span>
              {property} <b>{Math.round(value * 100) / 100}</b>
            </span>
            <RangeInput
              min={span.min}
              max={span.max}
              step={span.step}
              value={value}
              aria-label={property}
              onChange={(event) =>
                update({ numbers: { ...state.numbers, [property]: Number(event.target.value) } })
              }
            />
          </label>
        )
      })}
    </section>
  )
}

/** Item models resolved for drawing, by id (filled in as they load). */
function useResolvedModels(
  sources: AssetSources,
  ids: readonly string[]
): ReadonlyMap<string, ItemModelDraw> {
  const [resolved, setResolved] = useState<{
    sources: AssetSources
    models: ReadonlyMap<string, ItemModelDraw>
  }>({ sources, models: new Map() })
  const known = resolved.sources === sources ? resolved.models : null
  const missing = ids.filter((id) => !known?.has(id))
  const missingKey = missing.join('|')
  useEffect(() => {
    if (missing.length === 0) return
    let current = true
    void Promise.all(missing.map((id) => resolveItemModel(id, (p) => loadJson(sources, p)))).then(
      (loaded) => {
        if (!current) return
        setResolved((previous) => {
          const models = new Map(previous.sources === sources ? previous.models : [])
          for (const model of loaded) models.set(model.id, model)
          return { sources, models }
        })
      }
    )
    return () => {
      current = false
    }
    // `missingKey` stands for `missing`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, missingKey])
  return known ?? new Map()
}

type Sprite = {
  size: { width: number; height: number }
  alpha: (x: number, y: number) => boolean
} & ({ kind: 'live'; canvas: HTMLCanvasElement } | { kind: 'file'; image: RgbaImage })

/** The textures' pixels: the painted canvas for the open texture, decoded files for the rest. */
function useSprites(
  sources: AssetSources,
  ids: readonly string[],
  livePath: string
): ReadonlyMap<string, Sprite> {
  const [images, setImages] = useState<ReadonlyMap<string, RgbaImage | null>>(new Map())
  const files = ids.filter((id) => texturePath(id) !== livePath)
  const missing = files.filter((id) => !images.has(id))
  const missingKey = missing.join('|')
  useEffect(() => {
    if (missing.length === 0) return
    let current = true
    void Promise.all(
      missing.map(async (id): Promise<[string, RgbaImage | null]> => {
        const file = texturePath(id)
        const source = sources.pack.files.has(file)
          ? sources.pack
          : sources.vanilla?.files.has(file)
            ? sources.vanilla
            : null
        return [id, source ? await loadPng(source, file).catch(() => null) : null]
      })
    ).then((loaded) => {
      if (current) setImages((previous) => new Map([...previous, ...loaded]))
    })
    return () => {
      current = false
    }
    // `missingKey` stands for `missing`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, missingKey])
  const out = new Map<string, Sprite>()
  for (const id of ids) {
    if (texturePath(id) === livePath) continue
    const image = images.get(id)
    if (!image) continue
    out.set(id, {
      kind: 'file',
      image,
      size: image,
      alpha: (x, y) => image.data[(y * image.width + x) * 4 + 3]! > 0
    })
  }
  return out
}

function liveSprite(canvas: HTMLCanvasElement | null): Sprite | null {
  const context = canvas?.getContext('2d')
  if (!canvas || !context || canvas.width === 0) return null
  // Only the alpha is read back: exact even though the canvas colours are premultiplied.
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data
  const width = canvas.width
  return {
    kind: 'live',
    canvas,
    size: { width, height: canvas.height },
    alpha: (x, y) => data[(y * width + x) * 4 + 3]! > 0
  }
}

/** The grass colormap and friends (pack first), for grass tints. */
function useColormaps(sources: AssetSources): ColormapPixels {
  const [loaded, setLoaded] = useState<{ sources: AssetSources; maps: ColormapPixels } | null>(null)
  useEffect(() => {
    let current = true
    void loadColormaps(sources).then((maps) => current && setLoaded({ sources, maps }))
    return () => {
      current = false
    }
  }, [sources])
  return loaded && loaded.sources === sources ? loaded.maps : {}
}

/** A definition tint as 0xRRGGBB (white when unknown, or a grass tint without its colormap). */
function tintColor(tint: unknown, colormaps: ColormapPixels): number {
  const read = itemTint(tint)
  if (!read) return 0xffffff
  if ('rgb' in read) return (read.rgb[0] << 16) | (read.rgb[1] << 8) | read.rgb[2]
  const pixels = colormaps.grass
  if (!pixels) return 0xffffff
  const { x, y } = colormapPixel(read.grass.temperature, read.grass.downfall)
  const px = Math.min(pixels.width - 1, Math.floor((x / 256) * pixels.width))
  const py = Math.min(pixels.height - 1, Math.floor((y / 256) * pixels.height))
  const i = (py * pixels.width + px) * 4
  return (pixels.data[i]! << 16) | (pixels.data[i + 1]! << 8) | pixels.data[i + 2]!
}
