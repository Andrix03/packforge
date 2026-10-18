import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import fragmentShader from '../shaders/block.frag.glsl?raw'
import vertexShader from '../shaders/block.vert.glsl?raw'
import {
  frameAt,
  frameRect,
  parseAnimation,
  TICKS_PER_SECOND,
  type TextureAnimation
} from '../../shared/animation'
import { textureAxes, type Quad } from '../../shared/blockGeometry'
import type { DisplayTransform } from '../../shared/itemModel'
import { FLAT_NORMAL, METALS, metalF0, NO_SPECULAR, type Rgba } from '../../shared/labpbr'
import { decodePng } from '../../shared/pngCodec'
import { lightingAt, type Lighting } from './dayNight'
import { DEBUG_VIEWS, type EffectSettings, type ToneMappingId } from './effects'
import { environmentFor } from './lightingPresets'

export type PreviewScene = 'block' | 'wall' | 'floor'
export type Rgb = [number, number, number]
export type Vec3 = [number, number, number]

/** Quads of one texture, with a tint color per quad (white = untinted). */
export interface MeshPart {
  /** Identifies the texture (for reports). */
  key: string
  /** Pack-relative PNG path of the texture, when known. */
  path?: string | null
  /** Texture URL, or null to show Minecraft's missing texture. */
  url: string | null
  mcmetaUrl: string | null
  /** LabPBR maps (`_n.png`, `_s.png`), when the pack has them. */
  normalUrl?: string | null
  specularUrl?: string | null
  translucent: boolean
  quads: Array<{ quad: Quad; tint: Rgb }>
}

/** One block model repeated at several block positions. */
export interface WorldModel {
  key: string
  parts: MeshPart[]
  positions: Vec3[]
}

export interface PartReport {
  key: string
  size: { width: number; height: number } | null
  animation: TextureAnimation | null
  /** Which LabPBR maps were found and loaded. */
  maps: { normal: boolean; specular: boolean }
  /** Italian message when the texture or its animation could not be used. */
  problem: string | null
}

export interface WorldReport {
  main: PartReport[]
  compare: PartReport[]
}

/** Block positions for each scene; a wall/floor shows how the texture tiles. */
const SCENE_LAYOUTS: Record<PreviewScene, Vec3[]> = {
  block: [[0, 0, 0]],
  wall: grid((a, b) => [a, b, 0], 3),
  floor: grid((a, b) => [a, 0, b], 5)
}

const CAMERA_DISTANCE: Record<PreviewScene, number> = { block: 3.2, wall: 6, floor: 8.5 }

/** The game's mipmap levels setting (default 4); also capped by the texture size. */
const GAME_MIP_LEVELS = 4

/** Free-fly speed in blocks per second (about the game's creative flight). */
const FLY_SPEED = 8
const FLY_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight'
])

/** Where the right hand holds an item in first person (camera space, game constants). */
const RIGHT_HAND_OFFSET: Vec3 = [0.56, -0.52, -0.72]

/** Only HDR values above this glow (lit surfaces stay below it, strong emission goes over). */
const BLOOM_THRESHOLD = 1.1
const BLOOM_RADIUS = 0.15

const TONE_MAPPING: Record<ToneMappingId, THREE.ToneMapping> = {
  neutral: THREE.NeutralToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  none: THREE.NoToneMapping
}

/** The predefined LabPBR metals for the shader, generated from shared/labpbr.ts. */
const METALS_GLSL = (() => {
  const vec3 = (v: readonly number[]): string => `vec3(${v.map((x) => x.toFixed(5)).join(', ')})`
  const table = (name: string, rows: Array<readonly number[]>): string =>
    `const vec3 ${name}[${rows.length}] = vec3[${rows.length}](${rows.map(vec3).join(', ')});`
  return [
    table(
      'METAL_N',
      METALS.map((m) => m.n)
    ),
    table(
      'METAL_K',
      METALS.map((m) => m.k)
    ),
    table('METAL_F0', METALS.map(metalF0)),
    ''
  ].join('\n')
})()

interface LoadedPart {
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  texture: THREE.Texture
  /** LabPBR maps, or the shared flat/empty defaults (never disposed with the part). */
  normalMap: THREE.Texture
  specularMap: THREE.Texture
  imageSize: { width: number; height: number }
  animation: TextureAnimation | null
  /** Drawn from a live canvas (the texture being edited) instead of its file. */
  live: boolean
}

interface LoadedModel {
  parts: LoadedPart[]
  positions: Vec3[]
}

interface LoadedWithReports {
  loaded: LoadedModel
  reports: PartReport[]
}

/** The two sides of a comparison: what the pack shows, and the same thing in vanilla. */
interface Side {
  models: LoadedModel[]
  held: LoadedPart[]
  world: THREE.Group
  hand: THREE.Group
}

/**
 * Three.js scene for the preview: block models drawn with our shader, orbit or free-fly camera,
 * day/night lighting and an optional side-by-side comparison. Owns its WebGL resources.
 */
export class BlockPreview {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(40, 1, 0.05, 400)
  private readonly controls: OrbitControls
  private readonly resizeObserver: ResizeObserver
  private readonly loader = new THREE.TextureLoader()
  /** Shared by every material, so lighting changes apply everywhere. */
  private readonly sharedUniforms = {
    sunDirection: { value: new THREE.Vector3() },
    sunColor: { value: new THREE.Color() },
    moonDirection: { value: new THREE.Vector3() },
    moonColor: { value: new THREE.Color() },
    ambientColor: { value: new THREE.Color() },
    mipLevels: { value: 0 },
    pbr: { value: false },
    debugView: { value: 0 },
    skyZenith: { value: new THREE.Color() },
    skyHorizon: { value: new THREE.Color() },
    skyGround: { value: new THREE.Color() },
    torchColor: { value: new THREE.Color() },
    emissionStrength: { value: 0 }
  }
  /** LabPBR view (HDR → bloom → tone mapping); null = the vanilla look straight to the screen. */
  private effects: EffectSettings | null = null
  /** One HDR pipeline per half of the view (effects on), or null. */
  private composers: [Composer, Composer] | null = null
  private hour = 12
  private readonly main: Side = emptySide()
  private readonly other: Side = emptySide()
  /** Whether the right half shows the comparison. */
  private comparing = false
  /** setMesh mode: one model laid out by the scene kind (the small preview panels). */
  private single = true
  /** Canvases shown instead of the file at a URL (query string ignored). */
  private readonly liveTextures = new Map<string, LiveSource>()
  private sceneKind: PreviewScene = 'block'
  private animationStart = performance.now()
  private worldRequest = 0
  private heldRequest = 0
  private frame = 0
  private lastFrame = performance.now()
  private disposed = false
  private flying = false
  private readonly look = { yaw: 0, pitch: 0 }
  private readonly pressed = new Set<string>()
  private dragFrom: { x: number; y: number } | null = null

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.loader.setCrossOrigin('anonymous')

    this.scene.add(this.main.world, this.other.world, this.camera)
    this.camera.add(this.main.hand, this.other.hand)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.enablePan = false

    this.setScene('block')
    this.setTime(12)

    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()
    this.loop()
  }

  /** Replaces the displayed model, laid out by the scene kind. Resolves with one report per part. */
  async setMesh(parts: MeshPart[]): Promise<PartReport[]> {
    const report = await this.loadWorld(
      [{ key: 'mesh', parts, positions: SCENE_LAYOUTS[this.sceneKind] }],
      null,
      true
    )
    return report.main
  }

  /**
   * Replaces the whole world with several models at their positions. With `compare`, the view is
   * split: the left half shows `models`, the right half `compare`, with the same camera.
   */
  setWorld(models: WorldModel[], compare: WorldModel[] | null = null): Promise<WorldReport> {
    return this.loadWorld(models, compare, false)
  }

  /** Shows an item held in the right hand (first person); null parts hide it. */
  async setHeld(
    main: MeshPart[] | null,
    compare: MeshPart[] | null,
    display: DisplayTransform
  ): Promise<WorldReport> {
    const request = ++this.heldRequest
    const [mainParts, compareParts] = await Promise.all([
      Promise.all((main ?? []).map((part) => this.loadPart(part))),
      Promise.all((compare ?? []).map((part) => this.loadPart(part)))
    ])
    if (request !== this.heldRequest || this.disposed) {
      for (const { loaded } of [...mainParts, ...compareParts]) disposePart(loaded)
      return { main: [], compare: [] }
    }
    const matrix = displayMatrix(display)
    for (const [side, parts] of [
      [this.main, mainParts],
      [this.other, compareParts]
    ] as const) {
      for (const part of side.held) disposePart(part)
      side.held = parts.map((p) => p.loaded)
      side.hand.clear()
      side.hand.position.set(...RIGHT_HAND_OFFSET)
      const item = new THREE.Group()
      item.matrixAutoUpdate = false
      item.matrix.copy(matrix)
      for (const part of side.held) item.add(new THREE.Mesh(part.geometry, part.material))
      side.hand.add(item)
    }
    return { main: mainParts.map((p) => p.report), compare: compareParts.map((p) => p.report) }
  }

  /**
   * Shows `canvas` wherever the model uses the texture at `url` (the texture being edited).
   * Applies to meshes set afterwards; call refreshLiveTextures() after painting on the canvas.
   */
  setLiveTexture(
    url: string | null,
    canvas: HTMLCanvasElement | null,
    animation: LiveAnimation | null | undefined = undefined
  ): void {
    this.liveTextures.clear()
    if (url && canvas) this.liveTextures.set(withoutQuery(url), { canvas, animation })
  }

  refreshLiveTextures(): void {
    for (const part of this.allParts()) if (part.live) part.texture.needsUpdate = true
  }

  setScene(kind: PreviewScene): void {
    this.sceneKind = kind
    const model = this.main.models[0]
    if (this.single && model) {
      model.positions = SCENE_LAYOUTS[kind]
      this.layout(this.main)
    }
    const distance = CAMERA_DISTANCE[kind]
    this.setView([0, 0, 0], [distance * 0.7, distance * 0.55, distance * 0.85], 40)
  }

  /** Puts the camera at `focus + offset`, looking at `focus`. */
  setView(focus: Vec3, offset: Vec3, fov: number): void {
    this.camera.fov = fov
    this.camera.updateProjectionMatrix()
    this.camera.position.set(focus[0] + offset[0], focus[1] + offset[1], focus[2] + offset[2])
    this.controls.target.set(...focus)
    this.camera.lookAt(this.controls.target)
    this.syncLook()
    this.controls.update()
  }

  /** Moves the camera to `distance` blocks from what it looks at, keeping the direction. */
  setDistance(distance: number): void {
    if (this.flying) return
    const offset = this.camera.position.clone().sub(this.controls.target)
    if (offset.lengthSq() === 0) offset.set(0, 0, 1)
    this.camera.position.copy(this.controls.target).addScaledVector(offset.normalize(), distance)
    this.controls.update()
  }

  /** Mipmaps like the game: far textures are averaged instead of shimmering. */
  setMipmaps(enabled: boolean): void {
    this.sharedUniforms.mipLevels.value = enabled ? GAME_MIP_LEVELS : 0
  }

  /**
   * Free-fly camera: drag to look around, W A S D to move, Space / Shift to go up / down.
   * Off: back to orbiting around a point in front of the camera.
   */
  setFly(enabled: boolean): void {
    if (enabled === this.flying) return
    this.flying = enabled
    this.controls.enabled = !enabled
    this.pressed.clear()
    if (enabled) {
      this.syncLook()
    } else {
      const ahead = new THREE.Vector3()
      this.camera.getWorldDirection(ahead)
      this.controls.target.copy(this.camera.position).addScaledVector(ahead, 5)
      this.controls.update()
    }
  }

  /** Hour of the day in [0, 24). */
  setTime(hour: number): void {
    this.hour = hour
    this.applyLighting()
  }

  /**
   * LabPBR effects: `_n` / `_s` maps, PBR lighting with the chosen preset, bloom and tone mapping.
   * null goes back to the vanilla look.
   */
  setEffects(settings: EffectSettings | null): void {
    this.effects = settings
    const u = this.sharedUniforms
    u.pbr.value = settings !== null
    u.debugView.value = settings?.view ?? 0
    u.emissionStrength.value = settings?.emission ?? 0
    const raw = settings ? (DEBUG_VIEWS[settings.view]?.raw ?? false) : false
    if (settings) {
      this.composers ??= [
        new Composer(this.renderer, this.scene, this.camera),
        new Composer(this.renderer, this.scene, this.camera)
      ]
      this.renderer.toneMapping = raw ? THREE.NoToneMapping : TONE_MAPPING[settings.toneMapping]
      this.renderer.toneMappingExposure = raw ? 1 : 2 ** settings.exposure
      for (const { bloom } of this.composers) {
        bloom.enabled = !raw && settings.bloom > 0
        bloom.strength = settings.bloom
      }
    } else {
      for (const composer of this.composers ?? []) composer.dispose()
      this.composers = null
      this.renderer.toneMapping = THREE.NoToneMapping
      this.renderer.toneMappingExposure = 1
    }
    this.applyLighting()
  }

  private applyLighting(): void {
    const environment = this.effects ? environmentFor(this.effects.lighting, this.hour) : null
    const light: Lighting = environment ?? lightingAt(this.hour)
    const u = this.sharedUniforms
    if (environment) {
      u.skyZenith.value.setRGB(...environment.zenith)
      u.skyHorizon.value.setRGB(...environment.horizon)
      u.skyGround.value.setRGB(...environment.ground)
      u.torchColor.value.setRGB(...(environment.torch ?? [0, 0, 0]))
    }
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
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    for (const composer of this.composers ?? []) composer.dispose()
    for (const part of this.allParts()) disposePart(part)
    this.main.models = []
    this.other.models = []
    this.main.held = []
    this.other.held = []
    this.renderer.dispose()
  }

  private async loadWorld(
    models: WorldModel[],
    compare: WorldModel[] | null,
    single: boolean
  ): Promise<WorldReport> {
    const request = ++this.worldRequest
    const load = (list: WorldModel[]): Promise<LoadedWithReports[]> =>
      Promise.all(list.map((model) => this.loadModel(model)))
    const [main, other] = await Promise.all([load(models), load(compare ?? [])])
    if (request !== this.worldRequest || this.disposed) {
      for (const model of [...main, ...other])
        for (const part of model.loaded.parts) disposePart(part)
      return { main: [], compare: [] }
    }
    for (const side of [this.main, this.other]) {
      for (const model of side.models) for (const part of model.parts) disposePart(part)
    }
    this.single = single
    this.comparing = compare !== null
    this.main.models = main.map((m) => m.loaded)
    this.other.models = other.map((m) => m.loaded)
    this.animationStart = performance.now()
    this.layout(this.main)
    this.layout(this.other)
    return {
      main: main.flatMap((m) => m.reports),
      compare: other.flatMap((m) => m.reports)
    }
  }

  private async loadModel(model: WorldModel): Promise<LoadedWithReports> {
    const results = await Promise.all(model.parts.map((part) => this.loadPart(part)))
    return {
      loaded: { parts: results.map((r) => r.loaded), positions: model.positions },
      reports: results.map((r) => r.report)
    }
  }

  private async loadPart(part: MeshPart): Promise<{ loaded: LoadedPart; report: PartReport }> {
    let problem: string | null = null
    let texture: THREE.Texture
    const mapsLoading = Promise.all([
      part.normalUrl ? loadMap(part.normalUrl) : null,
      part.specularUrl ? loadMap(part.specularUrl) : null
    ])
    const live = part.url ? this.liveTextures.get(withoutQuery(part.url)) : undefined
    const liveCanvas = live?.canvas
    if (liveCanvas) {
      texture = new THREE.CanvasTexture(liveCanvas)
    } else if (part.url) {
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
    // Pixel art: no smoothing. Mipmaps exist but are only used when enabled (shader lod).
    const mipmapped = !(texture instanceof THREE.DataTexture)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = mipmapped ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter
    texture.generateMipmaps = mipmapped
    texture.colorSpace = THREE.SRGBColorSpace
    const image = texture.image as { width: number; height: number }
    const imageSize = { width: image.width, height: image.height }

    let animation: TextureAnimation | null = null
    if (live && live.animation !== undefined) {
      // The editor's animation (even unsaved) wins over the file on disk.
      if (live.animation) {
        const { frameHeight, frametime, interpolate } = live.animation
        const parsed = parseAnimation(
          { animation: { frametime, interpolate, width: imageSize.width, height: frameHeight } },
          imageSize.width,
          imageSize.height
        )
        if (parsed.ok) animation = parsed.animation
      }
    } else if (part.mcmetaUrl && problem === null) {
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

    // Levels that keep each frame separate: a 16×16 frame can go down to 1×1 (4 levels).
    const frameSide = animation
      ? Math.min(animation.frameWidth, animation.frameHeight)
      : Math.min(imageSize.width, imageSize.height)
    const maxLod = mipmapped ? Math.max(0, Math.floor(Math.log2(Math.max(1, frameSide)))) : 0

    // LabPBR maps share the albedo's frames (as fractions), so their shape must match.
    const [normal, specular] = await mapsLoading
    const mapProblems: string[] = []
    const checkMap = (map: MapResult | null, suffix: string): THREE.Texture | null => {
      if (!map) return null
      if (!map.ok) {
        mapProblems.push(`${suffix}: ${map.error}`)
        return null
      }
      const { width, height } = map.texture.image as { width: number; height: number }
      if (width * imageSize.height !== height * imageSize.width) {
        mapProblems.push(
          `${suffix} ha proporzioni diverse dalla texture (${width}×${height} contro ${imageSize.width}×${imageSize.height}): ignorata.`
        )
        map.texture.dispose()
        return null
      }
      return map.texture
    }
    const normalMap = checkMap(normal, '_n')
    const specularMap = checkMap(specular, '_s')
    if (mapProblems.length > 0) problem = [problem, ...mapProblems].filter(Boolean).join(' ')

    const material = new THREE.ShaderMaterial({
      // No explicit glslVersion: Three compiles GLSL ES 3.0 on WebGL2 and declares
      // the gl_FragColor output itself (with GLSL3 set, the shader must declare it).
      vertexShader,
      fragmentShader: METALS_GLSL + fragmentShader,
      transparent: part.translucent,
      depthWrite: !part.translucent,
      uniforms: {
        ...this.sharedUniforms,
        albedoMap: { value: texture },
        normalMap: { value: normalMap ?? defaultMaps().normal },
        specularMap: { value: specularMap ?? defaultMaps().specular },
        frameA: { value: new THREE.Vector4() },
        frameB: { value: new THREE.Vector4() },
        frameBlend: { value: 0 },
        maxLod: { value: maxLod },
        translucent: { value: part.translucent }
      }
    })
    const loaded: LoadedPart = {
      geometry: buildGeometry(part.quads),
      material,
      texture,
      normalMap: normalMap ?? defaultMaps().normal,
      specularMap: specularMap ?? defaultMaps().specular,
      imageSize,
      animation,
      live: liveCanvas !== undefined
    }
    setStaticFrame(loaded)
    return {
      loaded,
      report: {
        key: part.key,
        size: part.url ? imageSize : null,
        animation,
        maps: { normal: normalMap !== null, specular: specularMap !== null },
        problem
      }
    }
  }

  /** One instanced mesh per texture of each model, an instance per block position. */
  private layout(side: Side): void {
    side.world.clear()
    const matrix = new THREE.Matrix4()
    for (const model of side.models) {
      for (const part of model.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, model.positions.length)
        model.positions.forEach((at, i) => mesh.setMatrixAt(i, matrix.makeTranslation(...at)))
        mesh.frustumCulled = false
        side.world.add(mesh)
      }
    }
  }

  private *allParts(): Generator<LoadedPart> {
    for (const side of [this.main, this.other]) {
      for (const model of side.models) yield* model.parts
      yield* side.held
    }
  }

  private resize(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
  }

  /** Yaw/pitch of the free-fly camera from its current orientation. */
  private syncLook(): void {
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ')
    this.look.yaw = euler.y
    this.look.pitch = euler.x
  }

  private fly(seconds: number): void {
    const keys = this.pressed
    const axis = (plus: string[], minus: string[]): number =>
      (plus.some((k) => keys.has(k)) ? 1 : 0) - (minus.some((k) => keys.has(k)) ? 1 : 0)
    const forward = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown'])
    const right = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft'])
    const up = axis(['Space'], ['ShiftLeft', 'ShiftRight'])
    const step = FLY_SPEED * Math.min(seconds, 0.1)
    const { yaw } = this.look
    this.camera.position.x += (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * step
    this.camera.position.z += (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * step
    this.camera.position.y += up * step
    this.camera.rotation.set(this.look.pitch, yaw, 0, 'YXZ')
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.flying) return
    // A focused button would also react to Space.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    this.dragFrom = { x: event.clientX, y: event.clientY }
    this.canvas.setPointerCapture(event.pointerId)
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.flying || !this.dragFrom) return
    this.look.yaw -= (event.clientX - this.dragFrom.x) * 0.005
    this.look.pitch = Math.max(
      -1.55,
      Math.min(1.55, this.look.pitch - (event.clientY - this.dragFrom.y) * 0.005)
    )
    this.dragFrom = { x: event.clientX, y: event.clientY }
  }

  private onPointerUp = (): void => {
    this.dragFrom = null
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.flying || !FLY_KEYS.has(event.code) || isEditable(event.target)) return
    event.preventDefault()
    this.pressed.add(event.code)
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    if (!this.pressed.delete(event.code)) return
    event.preventDefault()
  }

  private onBlur = (): void => {
    this.pressed.clear()
  }

  /**
   * Draws the scene, the two halves side by side when comparing. With the effects on, each half
   * goes through its own HDR composer, so one half's bloom can't spill into the other.
   */
  private renderSides(): void {
    const size = this.renderer.getSize(new THREE.Vector2())
    if (size.x <= 0 || size.y <= 0) return
    const half = Math.floor(size.x / 2)
    const halves: Array<[Side, number, number]> = this.comparing
      ? [
          [this.main, 0, half],
          [this.other, half, size.x - half]
        ]
      : [[this.main, 0, size.x]]
    this.renderer.setScissorTest(this.comparing)
    halves.forEach(([side, x, width], i) => {
      this.renderer.setViewport(x, 0, width, size.y)
      this.renderer.setScissor(x, 0, width, size.y)
      this.main.world.visible = side === this.main
      this.main.hand.visible = side === this.main
      this.other.world.visible = side === this.other
      this.other.hand.visible = side === this.other
      const aspect = width / size.y
      if (this.camera.aspect !== aspect) {
        this.camera.aspect = aspect
        this.camera.updateProjectionMatrix()
      }
      const composer = this.composers?.[i]
      if (composer) composer.render(width, size.y)
      else this.renderer.render(this.scene, this.camera)
    })
    this.renderer.setScissorTest(false)
  }

  private loop = (now: number = performance.now()): void => {
    if (this.disposed) return
    const seconds = (now - this.lastFrame) / 1000
    this.lastFrame = now
    const ticks = ((now - this.animationStart) / 1000) * TICKS_PER_SECOND
    for (const part of this.allParts()) if (part.animation) setAnimatedFrame(part, ticks)
    if (this.flying) this.fly(seconds)
    else this.controls.update()
    this.renderSides()
    this.frame = requestAnimationFrame(this.loop)
  }
}

/**
 * HDR pipeline of the Effects view: scene → bloom → exposure, tone mapping and sRGB, drawn into
 * the renderer's current viewport (one half of the screen when comparing).
 */
class Composer {
  readonly bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, BLOOM_RADIUS, BLOOM_THRESHOLD)
  private readonly composer: EffectComposer
  private readonly output = new OutputPass()
  private readonly size = new THREE.Vector2()

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    // Half floats keep lights and emission above 1 for the bloom; 4× MSAA like the screen.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(renderer, target)
    this.composer.addPass(new DrawPass(scene, camera))
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.output)
  }

  /** `width` × `height` in CSS pixels, the size of the viewport it ends in. */
  render(width: number, height: number): void {
    if (this.size.x !== width || this.size.y !== height) {
      this.size.set(width, height)
      this.composer.setSize(width, height)
    }
    this.composer.render()
  }

  dispose(): void {
    this.bloom.dispose()
    this.output.dispose()
    this.composer.dispose()
  }
}

/** First pass: draws the scene into the composer's read buffer. */
class DrawPass extends Pass {
  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera
  ) {
    super()
    this.needsSwap = false
  }

  override render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    renderer.setRenderTarget(readBuffer)
    renderer.render(this.scene, this.camera)
  }
}

function emptySide(): Side {
  return { models: [], held: [], world: new THREE.Group(), hand: new THREE.Group() }
}

/**
 * A model display transform as the game applies it, on a model centered on 0:
 * translate (1/16 block), rotate X then Y then Z (Euler XYZ), scale.
 */
function displayMatrix(display: DisplayTransform): THREE.Matrix4 {
  const [rx, ry, rz] = display.rotation.map(THREE.MathUtils.degToRad) as Vec3
  const [tx, ty, tz] = display.translation
  return new THREE.Matrix4().compose(
    new THREE.Vector3(tx / 16, ty / 16, tz / 16),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')),
    new THREE.Vector3(...display.scale)
  )
}

/** Two counter-clockwise triangles per quad, in block units centered on 0. */
function buildGeometry(quads: MeshPart['quads']): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const tints: number[] = []
  const rights: number[] = []
  const downs: number[] = []
  // Corners are TL, TR, BR, BL seen from outside: TL-BL-BR and TL-BR-TR face outwards.
  const order = [0, 3, 2, 0, 2, 1]
  for (const { quad, tint } of quads) {
    const axes = textureAxes(quad)
    for (const i of order) {
      rights.push(...axes.right)
      downs.push(...axes.down)
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
  geometry.setAttribute('texRight', new THREE.Float32BufferAttribute(rights, 3))
  geometry.setAttribute('texDown', new THREE.Float32BufferAttribute(downs, 3))
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

/** Fields where typing letters means text (a focused checkbox or slider still lets you fly). */
function isEditable(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'range', 'button'].includes(target.type)
  }
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

/** Animation settings of a texture being edited (null = not animated). */
export interface LiveAnimation {
  frameHeight: number
  frametime: number
  interpolate: boolean
}

interface LiveSource {
  canvas: HTMLCanvasElement
  /** undefined = use the file's .png.mcmeta. */
  animation: LiveAnimation | null | undefined
}

function withoutQuery(url: string): string {
  const index = url.indexOf('?')
  return index === -1 ? url : url.slice(0, index)
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
  const defaults = defaultMaps()
  if (part.normalMap !== defaults.normal) part.normalMap.dispose()
  if (part.specularMap !== defaults.specular) part.specularMap.dispose()
}

type MapResult = { ok: true; texture: THREE.Texture } | { ok: false; error: string }

/**
 * A LabPBR map decoded exactly (straight alpha): the browser's decoder premultiplies, which would
 * wipe smoothness and F0 wherever emission (alpha) is 0. Linear data, nearest + mipmaps.
 */
async function loadMap(url: string): Promise<MapResult> {
  let bytes: Uint8Array
  try {
    const response = await fetch(url)
    if (!response.ok) return { ok: false, error: 'impossibile caricarla.' }
    bytes = new Uint8Array(await response.arrayBuffer())
  } catch {
    return { ok: false, error: 'impossibile caricarla.' }
  }
  const decoded = decodePng(bytes)
  if (!decoded.ok) return { ok: false, error: decoded.error }
  const { width, height, data } = decoded.image
  const texture = new THREE.DataTexture(data, width, height)
  // Same orientation as the albedo (TextureLoader images are flipped on upload).
  texture.flipY = true
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestMipmapLinearFilter
  texture.generateMipmaps = true
  texture.colorSpace = THREE.NoColorSpace
  texture.needsUpdate = true
  return { ok: true, texture }
}

let defaults: { normal: THREE.Texture; specular: THREE.Texture } | null = null

/** 1×1 maps for textures without `_n` / `_s`: flat normal, no AO; no specular, no emission. */
function defaultMaps(): { normal: THREE.Texture; specular: THREE.Texture } {
  const texel = (rgba: Rgba): THREE.Texture => {
    const texture = new THREE.DataTexture(new Uint8Array(rgba), 1, 1)
    texture.needsUpdate = true
    return texture
  }
  defaults ??= { normal: texel(FLAT_NORMAL), specular: texel(NO_SPECULAR) }
  return defaults
}

function grid(place: (a: number, b: number) => Vec3, size: number): Vec3[] {
  const half = (size - 1) / 2
  const cells: Vec3[] = []
  for (let a = -half; a <= half; a++) for (let b = -half; b <= half; b++) cells.push(place(a, b))
  return cells
}
