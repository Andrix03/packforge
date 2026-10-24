// The title screen panorama as the game shows it: the six faces on a cube seen from the inside,
// turning slowly. Faces as the game's CubeMap: 0 front (north), 1 right, 2 back, 3 left, 4 top,
// 5 bottom.
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/** BoxGeometry material order (+X, -X, +Y, -Y, +Z, -Z) → panorama face index. */
const BOX_FACES = [1, 3, 4, 5, 2, 0] as const

export function PanoramaView({
  faces,
  spin = true
}: {
  /** The six face URLs, panorama_0 … panorama_5 (null = not available). */
  faces: ReadonlyArray<string | null>
  spin?: boolean
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = faces.join('|')
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#1d1d1d')
    // The game's panorama camera: wide field of view, looking a little down.
    const camera = new THREE.PerspectiveCamera(85, 1, 0.05, 10)
    const loader = new THREE.TextureLoader()
    const textures: THREE.Texture[] = []
    const materials = BOX_FACES.map((face) => {
      const url = faces[face] ?? null
      if (!url) return new THREE.MeshBasicMaterial({ color: '#2b2b2b', side: THREE.BackSide })
      const texture = loader.load(url)
      texture.colorSpace = THREE.SRGBColorSpace
      // Seen from the inside the faces read mirrored: flip them back (u → 1 - u), clamped at the
      // edges so a face never samples the opposite border (a visible line along the cube edges).
      texture.wrapS = THREE.ClampToEdgeWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.repeat.x = -1
      texture.offset.x = 1
      textures.push(texture)
      return new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide })
    })
    const geometry = new THREE.BoxGeometry(2, 2, 2)
    scene.add(new THREE.Mesh(geometry, materials))

    let yaw = 0
    let frame = 0
    const draw = (): void => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== Math.round(width * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false)
        camera.aspect = width / Math.max(1, height)
        camera.updateProjectionMatrix()
      }
      camera.rotation.set(THREE.MathUtils.degToRad(-10), THREE.MathUtils.degToRad(-yaw), 0, 'YXZ')
      renderer.render(scene, camera)
      if (spin) yaw = (yaw + 0.1) % 360
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      geometry.dispose()
      for (const material of materials) material.dispose()
      for (const texture of textures) texture.dispose()
      renderer.dispose()
    }
    // `key` stands for the face URLs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, spin])
  return <canvas ref={ref} className="panorama-view" aria-hidden="true" />
}
