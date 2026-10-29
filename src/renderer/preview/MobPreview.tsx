// The editor's preview for the mobs with a known model (shared/mobModel.ts: zombie, husk,
// drowned): the texture being painted on the mob in 3D, live while painting. Drag to turn it.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { boxMesh } from '../../shared/armorModel'
import { tr } from '../../shared/i18n'
import type { MobModel } from '../../shared/mobModel'

function geometryOf(model: MobModel): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const box of model.boxes) {
    const mesh = boxMesh(box, model.textureWidth, model.textureHeight)
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

export function MobPreview({
  model,
  canvas: source,
  revision
}: {
  model: MobModel
  /** The pixels being painted (refreshed on `revision`). */
  canvas: HTMLCanvasElement | null
  revision: number
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const live = useRef<THREE.CanvasTexture | null>(null)
  const yaw = useRef(-0.5)
  const drag = useRef<number | null>(null)
  // The model needs one square frame (64×64, or an HD multiple): an animation strip or another
  // shape would stretch over the body. The size is read on every render (the editor re-renders
  // on each change), so a resized texture gets a new GPU copy.
  const width = source?.width ?? 0
  const height = source?.height ?? 0
  const fits = width > 0 && width === height && width % model.textureWidth === 0

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !source || !fits) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(-0.4, 1, 0.8)
    scene.add(sun)
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 400)
    camera.position.set(0, 18, 86)
    camera.lookAt(0, 16, 0)

    const texture = new THREE.CanvasTexture(source)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.colorSpace = THREE.SRGBColorSpace
    live.current = texture
    // Cut-out like the game: the transparent pixels of the hat layer are not drawn.
    const material = new THREE.MeshLambertMaterial({
      map: texture,
      alphaTest: 0.1,
      side: THREE.DoubleSide
    })
    const geometry = geometryOf(model)
    const mob = new THREE.Group()
    mob.add(new THREE.Mesh(geometry, material))
    mob.scale.setScalar(model.scale)
    scene.add(mob)

    let frame = 0
    const draw = (): void => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== Math.round(width * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false)
        camera.aspect = width / Math.max(1, height)
        camera.updateProjectionMatrix()
      }
      mob.rotation.y = yaw.current
      renderer.render(scene, camera)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      live.current = null
      geometry.dispose()
      material.dispose()
      texture.dispose()
      renderer.dispose()
    }
  }, [source, model, fits, width, height])

  // Every stroke: upload the painted pixels again.
  useEffect(() => {
    if (live.current) live.current.needsUpdate = true
  }, [revision])

  const title = tr('Anteprima del mob')
  return (
    <section className="armor-preview mob-preview card" aria-label={title}>
      <span className="lbl">{title}</span>
      <p className="muted small">
        {tr('Il modello del gioco ({0}), mentre dipingi. Trascina per girarlo.', model.mob)}
      </p>
      {!fits && (
        <p className="muted small" data-testid="mob-preview-off">
          {tr(
            'Il modello si vede con una texture quadrata, 64×64 o più grande, senza animazione (qui {0}×{1}).',
            width,
            height
          )}
        </p>
      )}
      <canvas
        hidden={!fits}
        ref={ref}
        className="armor-view sunken"
        aria-label={tr('Il mob in 3D, trascina per girarlo')}
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
    </section>
  )
}
