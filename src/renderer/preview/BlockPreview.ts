import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import fragmentShader from '../shaders/block.frag.glsl?raw'
import vertexShader from '../shaders/block.vert.glsl?raw'
import { frameAt, frameRect, TICKS_PER_SECOND, type TextureAnimation } from '../../shared/animation'
import { lightingAt } from './dayNight'

export type PreviewScene = 'block' | 'wall' | 'floor'

/** Block positions for each scene; a wall/floor shows how the texture tiles. */
const SCENE_LAYOUTS: Record<PreviewScene, Array<[number, number, number]>> = {
  block: [[0, 0, 0]],
  wall: grid((a, b) => [a, b, 0], 3),
  floor: grid((a, b) => [a, 0, b], 5)
}

const CAMERA_DISTANCE: Record<PreviewScene, number> = { block: 3.2, wall: 6, floor: 8.5 }

/**
 * Three.js scene for the texture preview: cubes with a custom shader,
 * orbit camera and day/night lighting. Owns its WebGL resources.
 */
export class BlockPreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  private readonly controls: OrbitControls
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1)
  private readonly material: THREE.ShaderMaterial
  private readonly blocks = new THREE.Group()
  private readonly resizeObserver: ResizeObserver
  private readonly loader = new THREE.TextureLoader()
  private texture: THREE.Texture | null = null
  private imageSize = { width: 1, height: 1 }
  private animation: TextureAnimation | null = null
  private animationStart = 0
  private textureRequest = 0
  private frame = 0
  private disposed = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.loader.setCrossOrigin('anonymous')

    // No explicit glslVersion: Three compiles GLSL ES 3.0 on WebGL2 and declares
    // the gl_FragColor output itself (with GLSL3 set, the shader must declare it).
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        albedoMap: { value: null },
        frameA: { value: new THREE.Vector4(0, 0, 1, 1) },
        frameB: { value: new THREE.Vector4(0, 0, 1, 1) },
        frameBlend: { value: 0 },
        sunDirection: { value: new THREE.Vector3() },
        sunColor: { value: new THREE.Color() },
        moonDirection: { value: new THREE.Vector3() },
        moonColor: { value: new THREE.Color() },
        ambientColor: { value: new THREE.Color() }
      }
    })

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

  /** Loads a texture URL (pack:// or vanilla). Resolves to the image size, or rejects. */
  setTexture(url: string | null): Promise<{ width: number; height: number } | null> {
    const request = ++this.textureRequest
    if (!url) {
      this.replaceTexture(null)
      return Promise.resolve(null)
    }
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (texture) => {
          // A newer request won the race: drop this one.
          if (request !== this.textureRequest || this.disposed) {
            texture.dispose()
            resolve(null)
            return
          }
          // Pixel art: no smoothing, no mipmaps.
          texture.magFilter = THREE.NearestFilter
          texture.minFilter = THREE.NearestFilter
          texture.generateMipmaps = false
          texture.colorSpace = THREE.SRGBColorSpace
          const image = texture.image as HTMLImageElement
          this.imageSize = { width: image.width, height: image.height }
          this.animation = null
          this.showStaticFrame()
          this.replaceTexture(texture)
          resolve({ width: image.width, height: image.height })
        },
        undefined,
        () => {
          if (request === this.textureRequest) this.replaceTexture(null)
          reject(new Error('Impossibile caricare la texture.'))
        }
      )
    })
  }

  /** Plays an animation for the current texture (null: first square frame). */
  setAnimation(animation: TextureAnimation | null): void {
    this.animation = animation
    this.animationStart = performance.now()
    if (!animation) this.showStaticFrame()
  }

  setScene(kind: PreviewScene): void {
    this.blocks.clear()
    for (const [x, y, z] of SCENE_LAYOUTS[kind]) {
      const mesh = new THREE.Mesh(this.geometry, this.material)
      mesh.position.set(x, y, z)
      this.blocks.add(mesh)
    }
    const distance = CAMERA_DISTANCE[kind]
    this.camera.position.set(distance * 0.7, distance * 0.55, distance * 0.85)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  /** Hour of the day in [0, 24). */
  setTime(hour: number): void {
    const light = lightingAt(hour)
    const uniforms = this.material.uniforms
    ;(uniforms['sunDirection']!.value as THREE.Vector3).set(...light.sunDirection)
    ;(uniforms['sunColor']!.value as THREE.Color).setRGB(...light.sunColor)
    ;(uniforms['moonDirection']!.value as THREE.Vector3).set(...light.moonDirection)
    ;(uniforms['moonColor']!.value as THREE.Color).setRGB(...light.moonColor)
    ;(uniforms['ambientColor']!.value as THREE.Color).setRGB(...light.ambient)
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
    this.texture?.dispose()
    this.geometry.dispose()
    this.material.dispose()
    this.renderer.dispose()
  }

  private replaceTexture(texture: THREE.Texture | null): void {
    this.texture?.dispose()
    this.texture = texture
    this.material.uniforms['albedoMap']!.value = texture
    this.blocks.visible = texture !== null
  }

  private resize(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  /** Top-left square of the smaller side, like the game's default frame. */
  private showStaticFrame(): void {
    const { width, height } = this.imageSize
    const side = Math.min(width, height)
    const frame = [0, 0, side / width, side / height] as const
    ;(this.material.uniforms['frameA']!.value as THREE.Vector4).set(...frame)
    ;(this.material.uniforms['frameB']!.value as THREE.Vector4).set(...frame)
    this.material.uniforms['frameBlend']!.value = 0
  }

  private updateAnimation(now: number): void {
    const animation = this.animation
    if (!animation) return
    const ticks = ((now - this.animationStart) / 1000) * TICKS_PER_SECOND
    const { current, next, blend } = frameAt(animation, ticks)
    const { width, height } = this.imageSize
    const toUniform = (index: number, target: THREE.Vector4): void => {
      const rect = frameRect(animation, index)
      target.set(rect.x / width, rect.y / height, rect.width / width, rect.height / height)
    }
    toUniform(current.index, this.material.uniforms['frameA']!.value as THREE.Vector4)
    toUniform(next.index, this.material.uniforms['frameB']!.value as THREE.Vector4)
    this.material.uniforms['frameBlend']!.value = blend
  }

  private loop = (now: number = performance.now()): void => {
    if (this.disposed) return
    this.updateAnimation(now)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.frame = requestAnimationFrame(this.loop)
  }
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
