import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import fragmentShader from '../shaders/block.frag.glsl?raw'
import vertexShader from '../shaders/block.vert.glsl?raw'
import {
  frameAt,
  frameRect,
  parseAnimation,
  TICKS_PER_SECOND,
  type TextureAnimation
} from '../../shared/animation'
import type { Quad } from '../../shared/blockGeometry'
import { lightingAt } from './dayNight'

export type PreviewScene = 'block' | 'wall' | 'floor'
export type Rgb = [number, number, number]

/** Quads of one texture, with a tint color per quad (white = untinted). */
export interface MeshPart {
  /** Identifies the texture (for reports). */
  key: string
  /** Texture URL, or null to show Minecraft's missing texture. */
  url: string | null
  mcmetaUrl: string | null
  translucent: boolean
  quads: Array<{ quad: Quad; tint: Rgb }>
}

export interface PartReport {
  key: string
  size: { width: number; height: number } | null
  animation: TextureAnimation | null
  /** Italian message when the texture or its animation could not be used. */
  problem: string | null
}

/** Block positions for each scene; a wall/floor shows how the texture tiles. */
const SCENE_LAYOUTS: Record<PreviewScene, Array<[number, number, number]>> = {
  block: [[0, 0, 0]],
  wall: grid((a, b) => [a, b, 0], 3),
  floor: grid((a, b) => [a, 0, b], 5)
}

const CAMERA_DISTANCE: Record<PreviewScene, number> = { block: 3.2, wall: 6, floor: 8.5 }

interface LoadedPart {
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  texture: THREE.Texture
  imageSize: { width: number; height: number }
  animation: TextureAnimation | null
}

/**
 * Three.js scene for the preview: block models drawn with our shader, orbit
 * camera and day/night lighting. Owns its WebGL resources.
 */
export class BlockPreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  private readonly controls: OrbitControls
  private readonly blocks = new THREE.Group()
  private readonly resizeObserver: ResizeObserver
  private readonly loader = new THREE.TextureLoader()
  /** Shared by every material, so lighting changes apply everywhere. */
  private readonly lightUniforms = {
    sunDirection: { value: new THREE.Vector3() },
    sunColor: { value: new THREE.Color() },
    moonDirection: { value: new THREE.Vector3() },
    moonColor: { value: new THREE.Color() },
    ambientColor: { value: new THREE.Color() }
  }
  private parts: LoadedPart[] = []
  private sceneKind: PreviewScene = 'block'
  private animationStart = performance.now()
  private meshRequest = 0
  private frame = 0
  private disposed = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.loader.setCrossOrigin('anonymous')

    this.scene.add(this.blocks)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.enablePan = false

    this.setScene('block')
    this.setTime(12)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
    this.loop()
  }

  /** Replaces the displayed model. Resolves with one report per part. */
  async setMesh(parts: MeshPart[]): Promise<PartReport[]> {
    const request = ++this.meshRequest
    const results = await Promise.all(parts.map((part) => this.loadPart(part)))
    if (request !== this.meshRequest || this.disposed) {
      for (const { loaded } of results) disposePart(loaded)
      return []
    }
    for (const part of this.parts) disposePart(part)
    this.parts = results.map((r) => r.loaded)
    this.animationStart = performance.now()
    this.layoutBlocks()
    return results.map((r) => r.report)
  }

  setScene(kind: PreviewScene): void {
    this.sceneKind = kind
    this.layoutBlocks()
    const distance = CAMERA_DISTANCE[kind]
    this.camera.position.set(distance * 0.7, distance * 0.55, distance * 0.85)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  /** Hour of the day in [0, 24). */
  setTime(hour: number): void {
    const light = lightingAt(hour)
    const u = this.lightUniforms
    u.sunDirection.value.set(...light.sunDirection)
    u.sunColor.value.setRGB(...light.sunColor)
    u.moonDirection.value.set(...light.moonDirection)
    u.moonColor.value.setRGB(...light.moonColor)
    u.ambientColor.value.setRGB(...light.ambient)
    this.scene.background = new THREE.Color().setRGB(...light.sky, THREE.SRGBColorSpace)
  }

  setAutoRotate(enabled: boolean): void {
    this.controls.autoRotate = enabled
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    for (const part of this.parts) disposePart(part)
    this.parts = []
    this.renderer.dispose()
  }

  private async loadPart(part: MeshPart): Promise<{ loaded: LoadedPart; report: PartReport }> {
    let problem: string | null = null
    let texture: THREE.Texture
    if (part.url) {
      try {
        texture = await this.loader.loadAsync(part.url)
      } catch {
        texture = missingTexture()
        problem = 'Impossibile caricare la texture.'
      }
    } else {
      texture = missingTexture()
      problem = 'Texture mancante: né nel pack né nel gioco.'
    }
    // Pixel art: no smoothing, no mipmaps.
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.generateMipmaps = false
    texture.colorSpace = THREE.SRGBColorSpace
    const image = texture.image as { width: number; height: number }
    const imageSize = { width: image.width, height: image.height }

    let animation: TextureAnimation | null = null
    if (part.mcmetaUrl && problem === null) {
      try {
        const parsed = parseAnimation(
          await (await fetch(part.mcmetaUrl)).json(),
          imageSize.width,
          imageSize.height
        )
        if (parsed.ok) {
          animation = parsed.animation
          problem = animation?.warning ?? null
        } else {
          problem = `Animazione non valida: ${parsed.error}`
        }
      } catch {
        problem = '.png.mcmeta non è un JSON valido.'
      }
    }

    const material = new THREE.ShaderMaterial({
      // No explicit glslVersion: Three compiles GLSL ES 3.0 on WebGL2 and declares
      // the gl_FragColor output itself (with GLSL3 set, the shader must declare it).
      vertexShader,
      fragmentShader,
      transparent: part.translucent,
      depthWrite: !part.translucent,
      uniforms: {
        ...this.lightUniforms,
        albedoMap: { value: texture },
        frameA: { value: new THREE.Vector4() },
        frameB: { value: new THREE.Vector4() },
        frameBlend: { value: 0 },
        translucent: { value: part.translucent }
      }
    })
    const loaded: LoadedPart = {
      geometry: buildGeometry(part.quads),
      material,
      texture,
      imageSize,
      animation
    }
    setStaticFrame(loaded)
    return {
      loaded,
      report: { key: part.key, size: part.url ? imageSize : null, animation, problem }
    }
  }

  private layoutBlocks(): void {
    this.blocks.clear()
    for (const [x, y, z] of SCENE_LAYOUTS[this.sceneKind]) {
      const block = new THREE.Group()
      block.position.set(x, y, z)
      for (const part of this.parts) block.add(new THREE.Mesh(part.geometry, part.material))
      this.blocks.add(block)
    }
  }

  private resize(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private loop = (now: number = performance.now()): void => {
    if (this.disposed) return
    const ticks = ((now - this.animationStart) / 1000) * TICKS_PER_SECOND
    for (const part of this.parts) if (part.animation) setAnimatedFrame(part, ticks)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.frame = requestAnimationFrame(this.loop)
  }
}

/** Two counter-clockwise triangles per quad, in block units centered on 0. */
function buildGeometry(quads: MeshPart['quads']): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const tints: number[] = []
  // Corners are TL, TR, BR, BL seen from outside: TL-BL-BR and TL-BR-TR face outwards.
  const order = [0, 3, 2, 0, 2, 1]
  for (const { quad, tint } of quads) {
    for (const i of order) {
      const p = quad.positions[i]!
      const uv = quad.uvs[i]!
      positions.push(p[0] / 16 - 0.5, p[1] / 16 - 0.5, p[2] / 16 - 0.5)
      normals.push(...quad.normal)
      uvs.push(uv[0] / 16, 1 - uv[1] / 16)
      // Albedo is decoded to linear on sampling; the game multiplies tint and
      // texture in sRGB, which matches linear(albedo) × linear(tint) here.
      tints.push(srgbToLinear(tint[0]), srgbToLinear(tint[1]), srgbToLinear(tint[2]))
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tints, 3))
  return geometry
}

/** Top-left square of the smaller side, like the game's default frame. */
function setStaticFrame(part: LoadedPart): void {
  const { width, height } = part.imageSize
  const side = Math.min(width, height)
  const frame = [0, 0, side / width, side / height] as const
  ;(part.material.uniforms['frameA']!.value as THREE.Vector4).set(...frame)
  ;(part.material.uniforms['frameB']!.value as THREE.Vector4).set(...frame)
  part.material.uniforms['frameBlend']!.value = 0
}

function setAnimatedFrame(part: LoadedPart, ticks: number): void {
  const animation = part.animation
  if (!animation) return
  const { current, next, blend } = frameAt(animation, ticks)
  const { width, height } = part.imageSize
  const toUniform = (index: number, target: THREE.Vector4): void => {
    const rect = frameRect(animation, index)
    target.set(rect.x / width, rect.y / height, rect.width / width, rect.height / height)
  }
  toUniform(current.index, part.material.uniforms['frameA']!.value as THREE.Vector4)
  toUniform(next.index, part.material.uniforms['frameB']!.value as THREE.Vector4)
  part.material.uniforms['frameBlend']!.value = blend
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Minecraft's magenta/black missing-texture checkerboard. */
function missingTexture(): THREE.Texture {
  const data = new Uint8Array([248, 0, 248, 255, 0, 0, 0, 255, 0, 0, 0, 255, 248, 0, 248, 255])
  const texture = new THREE.DataTexture(data, 2, 2)
  texture.needsUpdate = true
  return texture
}

function disposePart(part: LoadedPart): void {
  part.geometry.dispose()
  part.material.dispose()
  part.texture.dispose()
}

function grid(
  place: (a: number, b: number) => [number, number, number],
  size: number
): Array<[number, number, number]> {
  const half = (size - 1) / 2
  const cells: Array<[number, number, number]> = []
  for (let a = -half; a <= half; a++) for (let b = -half; b <= half; b++) cells.push(place(a, b))
  return cells
}
