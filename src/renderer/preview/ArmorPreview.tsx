// The editor's preview for armor and armor trim textures, in place of the 3D block: a grey player
// wearing the armor as the game builds it (the outer layer for helmet, chestplate and boots, the
// inner one for leggings), live while painting. Drag to turn it. The texture being painted can be
// the armor (`entity/equipment/humanoid(_leggings)/…`, 64×32), a trim pattern
// (`trims/entity/…`, grey shades) or a trim material palette (8×1): the other two pieces are picked
// from the pack or vanilla and the trim is coloured as the game does (shared/equipment applyPalette).
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { tr } from '../../shared/i18n'
import {
  LEATHER_DEFAULT_COLOR,
  armorBoxes,
  armorLayerOf,
  boxMesh,
  companionLayerPath,
  isDyeableArmor,
  type ArmorBox,
  type ArmorLayer
} from '../../shared/armorModel'
import { HUMANOID_PARTS, applyPalette, offPalettePixels, type Pixels } from '../../shared/equipment'
import {
  BASE_PALETTES,
  armorMaterialOf,
  armorPreviewRole,
  trimChoices,
  trimMaterialOf,
  trimPalette,
  trimPatternOf
} from '../../shared/trims'
import { SwitchRow } from '../ui/components'
import { loadPng } from '../packs/packFetch'
import { resolveAssetUrl, type AssetSources } from './modelSource'

interface Props {
  path: string
  /** The pixels being painted (refreshed on `revision`). */
  canvas: HTMLCanvasElement | null
  revision: number
  sources: AssetSources
}

/** The player's own body under the armor: the same boxes, not inflated. */
const BODY: ArmorBox[] = armorBoxes('humanoid')
  .filter((box) => box.part !== 'hat')
  .map((box) => ({ ...box, inflate: 0 }))

function geometryOf(boxes: ArmorBox[]): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const box of boxes) {
    const mesh = boxMesh(box)
    const base = positions.length / 3
    positions.push(...mesh.positions)
    // Three.js puts v = 0 at the bottom of the texture.
    mesh.uvs.forEach((value, i) => uvs.push(i % 2 === 1 ? 1 - value : value))
    indices.push(...mesh.indices.map((index) => index + base))
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function armorMaterial(map: THREE.Texture, tint: number | null): THREE.MeshLambertMaterial {
  map.magFilter = THREE.NearestFilter
  map.minFilter = THREE.NearestFilter
  map.colorSpace = THREE.SRGBColorSpace
  // The game draws armor as cut-out without back-face culling (the inside shows through gaps).
  return new THREE.MeshLambertMaterial({
    map,
    color: tint ?? 0xffffff,
    alphaTest: 0.1,
    side: THREE.DoubleSide
  })
}

/** A pack or vanilla PNG decoded by our codec (null while loading, or when missing). */
function usePixels(sources: AssetSources, path: string | null): Pixels | null {
  const [loaded, setLoaded] = useState<{ path: string; image: Pixels | null } | null>(null)
  useEffect(() => {
    if (!path) return
    const source = sources.pack.files.has(path)
      ? sources.pack
      : sources.vanilla?.files.has(path)
        ? sources.vanilla
        : null
    if (!source) return
    let cancelled = false
    loadPng(source, path)
      .catch(() => null)
      .then((image) => {
        if (!cancelled) setLoaded({ path, image })
      })
    return () => {
      cancelled = true
    }
  }, [sources, path])
  return loaded && loaded.path === path ? loaded.image : null
}

/** The painted pixels. Opaque and fully transparent pixels (all a trim has) read back exactly. */
function canvasPixels(canvas: HTMLCanvasElement | null): Pixels | null {
  const context = canvas?.getContext('2d')
  if (!canvas || !context || canvas.width === 0) return null
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

function pick(names: ReadonlyMap<string, string>, preferred: string): string | null {
  if (names.has(preferred)) return preferred
  return names.keys().next().value ?? null
}

export function ArmorPreview(props: Props): React.JSX.Element {
  const role = armorPreviewRole(props.path) ?? 'armor'
  const layer: ArmorLayer =
    role === 'armor'
      ? (armorLayerOf(props.path) ?? 'humanoid')
      : role === 'pattern'
        ? (trimPatternOf(props.path)?.layer ?? 'humanoid')
        : 'humanoid'
  const { pack, vanilla } = props.sources
  const choices = useMemo(
    () => trimChoices([...pack.files, ...(vanilla?.files ?? [])], layer),
    [pack.files, vanilla?.files, layer]
  )
  const basePath =
    BASE_PALETTES.find((path) => pack.files.has(path) || vanilla?.files.has(path)) ?? null

  // undefined = the default pick.
  const [chosenArmor, setArmor] = useState<string | undefined>(undefined)
  const [chosenPattern, setPattern] = useState<string | null | undefined>(undefined)
  const [chosenMaterial, setMaterial] = useState<string | undefined>(undefined)
  const armorName =
    role === 'armor' ? armorMaterialOf(props.path) : (chosenArmor ?? pick(choices.armors, 'iron'))
  const patternName =
    role === 'pattern'
      ? (trimPatternOf(props.path)?.name ?? null)
      : chosenPattern === undefined
        ? role === 'palette'
          ? pick(choices.patterns, 'sentry')
          : null
        : chosenPattern
  const materialName =
    role === 'palette'
      ? trimMaterialOf(props.path)
      : (chosenMaterial ?? pick(choices.materials, 'gold'))

  const armorPath =
    role === 'armor' ? props.path : ((armorName && choices.armors.get(armorName)) ?? null)
  const armorUrl = role === 'armor' || !armorPath ? null : resolveAssetUrl(props.sources, armorPath)
  const companionPath = role === 'armor' ? companionLayerPath(props.path) : null
  const companionUrl = companionPath ? resolveAssetUrl(props.sources, companionPath) : null
  const [showCompanion, setShowCompanion] = useState(true)
  const dyeable = armorPath !== null && isDyeableArmor(armorPath)
  const [dye, setDye] = useState(`#${LEATHER_DEFAULT_COLOR.toString(16).padStart(6, '0')}`)
  const tint = dyeable ? Number.parseInt(dye.slice(1), 16) : null

  const base = usePixels(props.sources, basePath)
  const pattern = usePixels(
    props.sources,
    role !== 'pattern' && patternName ? (choices.patterns.get(patternName) ?? null) : null
  )
  const palette = usePixels(
    props.sources,
    role !== 'palette' && materialName
      ? trimPalette(choices.palettes, materialName, armorName)
      : null
  )

  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef<THREE.CanvasTexture | null>(null)
  const trimTexture = useRef<THREE.CanvasTexture | null>(null)
  const [trimCanvas] = useState(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 32
    return canvas
  })
  const yaw = useRef(-0.5)

  useEffect(() => {
    const canvas = ref.current
    const source = props.canvas
    if (!canvas || !source) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(-0.4, 1, 0.8)
    scene.add(sun)
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 400)
    camera.position.set(0, 18, 82)
    camera.lookAt(0, 16, 0)

    const player = new THREE.Group()
    scene.add(player)
    const disposables: Array<{ dispose(): void }> = []
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material): void => {
      player.add(new THREE.Mesh(geometry, material))
      disposables.push(geometry, material)
    }
    add(geometryOf(BODY), new THREE.MeshLambertMaterial({ color: 0x8a8f96 }))

    const loader = new THREE.TextureLoader()
    // The armor: the painted pixels, or the picked armor under a trim being painted.
    const armorTexture =
      role === 'armor' ? new THREE.CanvasTexture(source) : armorUrl ? loader.load(armorUrl) : null
    if (role === 'armor') live.current = armorTexture as THREE.CanvasTexture
    if (armorTexture) {
      disposables.push(armorTexture)
      add(geometryOf(armorBoxes(layer)), armorMaterial(armorTexture, tint))
    }
    if (showCompanion && companionUrl) {
      const other = loader.load(companionUrl)
      disposables.push(other)
      add(
        geometryOf(armorBoxes(layer === 'humanoid' ? 'humanoid_leggings' : 'humanoid')),
        armorMaterial(other, tint)
      )
    }
    // The trim, drawn over the armor on the same boxes (the game draws it right after).
    const trim = new THREE.CanvasTexture(trimCanvas)
    trimTexture.current = trim
    const trimMaterial = armorMaterial(trim, null)
    trimMaterial.polygonOffset = true
    trimMaterial.polygonOffsetFactor = -1
    trimMaterial.polygonOffsetUnits = -1
    disposables.push(trim)
    add(geometryOf(armorBoxes(layer)), trimMaterial)

    let frame = 0
    const draw = (): void => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== Math.round(width * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false)
        camera.aspect = width / Math.max(1, height)
        camera.updateProjectionMatrix()
      }
      player.rotation.y = yaw.current
      renderer.render(scene, camera)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      live.current = null
      trimTexture.current = null
      for (const item of disposables) item.dispose()
      renderer.dispose()
    }
  }, [props.canvas, role, layer, armorUrl, companionUrl, showCompanion, tint, trimCanvas])

  // Every stroke: upload the painted pixels again.
  useEffect(() => {
    if (live.current) live.current.needsUpdate = true
  }, [props.revision])

  // The coloured trim: the pattern's base-palette greys swapped for the material's colours.
  const trimShown = role !== 'armor' || patternName !== null
  useEffect(() => {
    const patternPixels = role === 'pattern' ? canvasPixels(props.canvas) : pattern
    const palettePixels = role === 'palette' ? canvasPixels(props.canvas) : palette
    const context = trimCanvas.getContext('2d')
    if (!context) return
    if (!trimShown || !patternPixels || !palettePixels || !base) {
      context.clearRect(0, 0, trimCanvas.width, trimCanvas.height)
    } else {
      if (trimCanvas.width !== patternPixels.width || trimCanvas.height !== patternPixels.height) {
        trimCanvas.width = patternPixels.width
        trimCanvas.height = patternPixels.height
        // The GPU copy keeps its first size: drop it so the next frame uploads at the new one.
        trimTexture.current?.dispose()
      }
      const colored = applyPalette(patternPixels, base, palettePixels)
      context.putImageData(
        new ImageData(new Uint8ClampedArray(colored), patternPixels.width, patternPixels.height),
        0,
        0
      )
    }
    if (trimTexture.current) trimTexture.current.needsUpdate = true
  }, [role, props.canvas, props.revision, pattern, palette, base, trimShown, trimCanvas, armorUrl])

  const select = (
    label: string,
    value: string | null,
    names: Iterable<string>,
    onChange: (next: string | null) => void,
    none?: string
  ): React.JSX.Element => (
    <label className="small select-field">
      {label}{' '}
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        {none && <option value="">{none}</option>}
        {[...names].map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )

  const drag = useRef<number | null>(null)
  // The pattern's pixels outside the base greys (the painted one, or the chosen pattern).
  const patternNow = role === 'pattern' ? canvasPixels(props.canvas) : trimShown ? pattern : null
  const offBase = patternNow && base ? offPalettePixels(patternNow, base) : 0
  const title = role === 'armor' ? tr('Anteprima armatura') : tr('Anteprima rifinitura')
  return (
    <section className="armor-preview card" aria-label={title}>
      <span className="lbl">{title}</span>
      <p className="muted small">
        {role === 'pattern'
          ? tr('Motivo di rifinitura: i grigi di trim_base diventano i colori del materiale.')
          : role === 'palette'
            ? tr('Colori di un materiale: sostituiscono gli 8 grigi di trim_base, in ordine.')
            : layer === 'humanoid'
              ? tr('Strato esterno: elmo, corazza e stivali.')
              : tr('Strato interno: gambali.')}
      </p>
      <canvas
        ref={ref}
        className="armor-view sunken"
        aria-label={tr('Giocatore con l’armatura, trascina per girarlo')}
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
      <div className="armor-choices">
        {role !== 'armor' &&
          select(tr('Armatura'), armorName, choices.armors.keys(), (name) =>
            setArmor(name ?? undefined)
          )}
        {role !== 'pattern' &&
          select(
            tr('Rifinitura'),
            patternName,
            choices.patterns.keys(),
            setPattern,
            role === 'armor' ? tr('Nessuna') : undefined
          )}
        {role !== 'palette' &&
          trimShown &&
          select(tr('Materiale'), materialName, choices.materials.keys(), (name) =>
            setMaterial(name ?? undefined)
          )}
      </div>
      {offBase > 0 && (
        <p className="field-error small" role="alert" data-testid="trim-off-palette">
          {tr(
            '{0} pixel del motivo non usano gli 8 grigi di trim_base: nel gioco restano di quel colore, senza il colore del materiale. Dipingi solo con i grigi della tavolozza trim_base.',
            offBase
          )}
        </p>
      )}
      {trimShown && !base && (
        <p className="muted small">
          {tr('Serve la tavolozza trim_base (vanilla): apri un pack con la versione del gioco.')}
        </p>
      )}
      {companionUrl && (
        <SwitchRow
          checked={showCompanion}
          onChange={setShowCompanion}
          label={
            layer === 'humanoid' ? tr('Mostra anche i gambali') : tr('Mostra anche elmo e corazza')
          }
        />
      )}
      {role !== 'palette' && (
        <PartMap layer={layer} canvas={props.canvas} revision={props.revision} />
      )}
      {dyeable && (
        <label className="row armor-dye">
          <span className="lbl">{tr('Colore della tintura')}</span>
          <input
            type="color"
            value={dye}
            onChange={(event) => setDye(event.target.value)}
            aria-label={tr('Colore della tintura')}
          />
        </label>
      )}
    </section>
  )
}

const PART_COLORS: Record<string, string> = {
  head: '#f0c020',
  hat: '#f07820',
  body: '#40c0f0',
  arm: '#60d060',
  leg: '#e060e0'
}
const MAP_SCALE = 4

/**
 * The texture with the zones this layer draws outlined by body part (the legend names them):
 * where to paint what. Zones the layer never shows are dimmed.
 */
function PartMap({
  layer,
  canvas,
  revision
}: {
  layer: ArmorLayer
  canvas: HTMLCanvasElement | null
  revision: number
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const boxes = armorBoxes(layer).filter((box) => !box.mirror)
  const groups = [...new Set(boxes.map((box) => box.part.replace(/^(right|left)_/, '')))]
  useEffect(() => {
    const map = ref.current
    const context = map?.getContext('2d')
    if (!map || !context || !canvas) return
    const width = 64 * MAP_SCALE
    const height = 32 * MAP_SCALE
    context.clearRect(0, 0, width, height)
    context.imageSmoothingEnabled = false
    context.drawImage(canvas, 0, 0, width, height)
    context.fillStyle = 'rgba(0, 0, 0, 0.55)'
    context.fillRect(0, 0, width, height)
    for (const box of boxes) {
      const color = PART_COLORS[box.part.replace(/^(right|left)_/, '')] ?? '#ffffff'
      for (const face of Object.values(box.faces)) {
        const [x, y, w, h] = [face.x, face.y, face.width, face.height].map((v) => v * MAP_SCALE)
        // Lift the dimming inside the zone, then outline it.
        context.drawImage(
          canvas,
          (face.x * canvas.width) / 64,
          (face.y * canvas.height) / 32,
          (face.width * canvas.width) / 64,
          (face.height * canvas.height) / 32,
          x!,
          y!,
          w!,
          h!
        )
        context.strokeStyle = color
        context.lineWidth = 2
        context.strokeRect(x! + 1, y! + 1, w! - 2, h! - 2)
      }
    }
    // `boxes` follows `layer`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas, revision, layer])
  const label = (group: string): string =>
    HUMANOID_PARTS.find((part) => part.id === group)?.label ?? group
  return (
    <div className="armor-map">
      <span className="lbl">{tr('Dove dipingere')}</span>
      <canvas
        ref={ref}
        width={64 * MAP_SCALE}
        height={32 * MAP_SCALE}
        className="sunken"
        aria-label={tr('Mappa dei pezzi dell’armatura sulla texture')}
      />
      <div className="armor-legend">
        {groups.map((group) => (
          <span key={group}>
            <i style={{ background: PART_COLORS[group] }} />
            {label(group)}
          </span>
        ))}
      </div>
    </div>
  )
}
