// A block model drawn from a JSON being edited (the element editor): its parents and textures
// come from the pack or vanilla, the selected element is outlined. Drag to turn it.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { buildQuads, type Quad } from '../../shared/blockGeometry'
import { modelPath, namespaced, resolveModel, texturePath } from '../../shared/blockModel'
import type { RgbaImage } from '../../shared/pngCodec'
import { tr } from '../../shared/i18n'
import { loadPng } from '../packs/packFetch'
import { resolveAssetUrl, type AssetSources } from './modelSource'
import { frameHeight, geometryOf } from './quadMesh'

async function loadJson(sources: AssetSources, path: string): Promise<unknown> {
  const url = resolveAssetUrl(sources, path)
  if (!url) return null
  try {
    return await (await fetch(url, { cache: 'no-store' })).json()
  } catch {
    return null
  }
}

export function ModelView({
  id,
  json,
  sources,
  selected
}: {
  /** The model's id (`minecraft:block/stone`): its own path reads `json` instead of the file. */
  id: string
  json: unknown
  sources: AssetSources
  /** Index of the element to outline, or null. */
  selected: number | null
}): React.JSX.Element {
  const [quads, setQuads] = useState<Quad[]>([])
  const [images, setImages] = useState<ReadonlyMap<string, RgbaImage | null>>(new Map())
  const own = modelPath(namespaced(id))

  useEffect(() => {
    let current = true
    void resolveModel(id, (path) =>
      path === own ? Promise.resolve(json) : loadJson(sources, path)
    ).then((model) => current && setQuads(buildQuads(model, { x: 0, y: 0 })))
    return () => {
      current = false
    }
  }, [id, own, json, sources])

  const textureIds = [...new Set(quads.flatMap((q) => (q.texture ? [q.texture.id] : [])))]
  const missing = textureIds.filter((t) => !images.has(t))
  const missingKey = missing.join('|')
  useEffect(() => {
    if (missing.length === 0) return
    let current = true
    void Promise.all(
      missing.map(async (tex): Promise<[string, RgbaImage | null]> => {
        const file = texturePath(tex)
        const source = sources.pack.files.has(file)
          ? sources.pack
          : sources.vanilla?.files.has(file)
            ? sources.vanilla
            : null
        return [tex, source ? await loadPng(source, file).catch(() => null) : null]
      })
    ).then((loaded) => current && setImages((prev) => new Map([...prev, ...loaded])))
    return () => {
      current = false
    }
    // `missingKey` stands for `missing`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, missingKey])

  const ref = useRef<HTMLCanvasElement>(null)
  const holderRef = useRef<THREE.Group | null>(null)
  const yaw = useRef(0.7)
  const pitch = useRef(0.45)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 1.7))
    const sun = new THREE.DirectionalLight(0xffffff, 1.3)
    sun.position.set(0.5, 1, 0.7)
    scene.add(sun)
    // The block's outline: where 0–16 is.
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x555555 })
    )
    scene.add(outline)
    const holder = new THREE.Group()
    scene.add(holder)
    holderRef.current = holder
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
    let frame = 0
    const draw = (): void => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== Math.round(width * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false)
        camera.aspect = width / Math.max(1, height)
        camera.updateProjectionMatrix()
      }
      const d = 3.6
      camera.position.set(
        Math.sin(yaw.current) * Math.cos(pitch.current) * d,
        Math.sin(pitch.current) * d,
        Math.cos(yaw.current) * Math.cos(pitch.current) * d
      )
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
      frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(frame)
      holderRef.current = null
      outline.geometry.dispose()
      renderer.dispose()
    }
  }, [])

  useEffect(() => {
    const holder = holderRef.current
    if (!holder) return
    const disposables: Array<{ dispose(): void }> = []
    const group = new THREE.Group()
    const byTexture = new Map<string, Quad[]>()
    for (const quad of quads) {
      if (!quad.texture) continue
      byTexture.set(quad.texture.id, [...(byTexture.get(quad.texture.id) ?? []), quad])
    }
    for (const [tex, list] of byTexture) {
      const image = images.get(tex)
      const texture = image
        ? new THREE.DataTexture(image.data, image.width, image.height, THREE.RGBAFormat)
        : null
      if (texture) {
        texture.flipY = false
        texture.magFilter = THREE.NearestFilter
        texture.minFilter = THREE.NearestFilter
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true
        disposables.push(texture)
      }
      const geometry = geometryOf(list, image ? frameHeight(image) / image.height : 1)
      const material = new THREE.MeshLambertMaterial({
        ...(texture ? { map: texture } : { color: 0xff00ff }),
        alphaTest: 0.1,
        side: THREE.DoubleSide
      })
      disposables.push(geometry, material)
      group.add(new THREE.Mesh(geometry, material))
    }
    // The selected element's box (before its rotation).
    const element = selected === null ? null : elementBox(json, selected)
    if (element) {
      const size = element.to.map((v, i) => Math.max(0.01, (v - element.from[i]!) / 16))
      const box = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(size[0], size[1], size[2])),
        new THREE.LineBasicMaterial({ color: 0x7fd34b, depthTest: false })
      )
      box.renderOrder = 1
      box.position.set(
        ...(element.from.map((v, i) => (v + element.to[i]!) / 32 - 0.5) as [number, number, number])
      )
      disposables.push(box.geometry, box.material)
      group.add(box)
    }
    holder.add(group)
    return () => {
      holder.remove(group)
      for (const d of disposables) d.dispose()
    }
  }, [quads, images, json, selected])

  const drag = useRef<{ x: number; y: number } | null>(null)
  return (
    <canvas
      ref={ref}
      className="model-view sunken"
      aria-label={tr('Il modello, trascina per girarlo')}
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        yaw.current -= (event.clientX - drag.current.x) * 0.01
        pitch.current = Math.max(
          -1.4,
          Math.min(1.4, pitch.current + (event.clientY - drag.current.y) * 0.01)
        )
        drag.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerUp={() => {
        drag.current = null
      }}
    />
  )
}

function elementBox(json: unknown, index: number): { from: number[]; to: number[] } | null {
  const elements = (json as { elements?: unknown } | null)?.elements
  const element = Array.isArray(elements) ? (elements[index] as Record<string, unknown>) : null
  const from = element?.['from']
  const to = element?.['to']
  return Array.isArray(from) && Array.isArray(to) ? { from, to } : null
}
