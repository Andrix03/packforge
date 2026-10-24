// The editor's preview for armor textures (`entity/equipment/humanoid(_leggings)/…`, 64×32), in
// place of the 3D block: a grey player wearing the armor as the game builds it (the outer layer
// for helmet, chestplate and boots, the inner one for leggings), live while painting. Drag to
// turn it; the other layer of the same armor can be shown too, leather gets its dye.
import { useEffect, useRef, useState } from 'react'
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
import { HUMANOID_PARTS } from '../../shared/equipment'
import { SwitchRow } from '../ui/components'
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

export function ArmorPreview(props: Props): React.JSX.Element {
  const layer = armorLayerOf(props.path) as ArmorLayer
  const companionPath = companionLayerPath(props.path)
  const companionUrl = companionPath ? resolveAssetUrl(props.sources, companionPath) : null
  const [showCompanion, setShowCompanion] = useState(true)
  const dyeable = isDyeableArmor(props.path)
  const [dye, setDye] = useState(`#${LEATHER_DEFAULT_COLOR.toString(16).padStart(6, '0')}`)
  const tint = dyeable ? Number.parseInt(dye.slice(1), 16) : null

  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef<THREE.CanvasTexture | null>(null)
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

    const texture = new THREE.CanvasTexture(source)
    live.current = texture
    disposables.push(texture)
    add(geometryOf(armorBoxes(layer)), armorMaterial(texture, tint))
    if (showCompanion && companionUrl) {
      const other = new THREE.TextureLoader().load(companionUrl)
      disposables.push(other)
      add(
        geometryOf(armorBoxes(layer === 'humanoid' ? 'humanoid_leggings' : 'humanoid')),
        armorMaterial(other, tint)
      )
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
      player.rotation.y = yaw.current
      renderer.render(scene, camera)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      live.current = null
      for (const item of disposables) item.dispose()
      renderer.dispose()
    }
  }, [props.canvas, layer, companionUrl, showCompanion, tint])

  // Every stroke: upload the painted pixels again.
  useEffect(() => {
    if (live.current) live.current.needsUpdate = true
  }, [props.revision])

  const drag = useRef<number | null>(null)
  return (
    <section className="armor-preview card" aria-label={tr('Anteprima armatura')}>
      <span className="lbl">{tr('Anteprima armatura')}</span>
      <p className="muted small">
        {layer === 'humanoid'
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
      {companionUrl && (
        <SwitchRow
          checked={showCompanion}
          onChange={setShowCompanion}
          label={
            layer === 'humanoid' ? tr('Mostra anche i gambali') : tr('Mostra anche elmo e corazza')
          }
        />
      )}
      <PartMap layer={layer} canvas={props.canvas} revision={props.revision} />
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
