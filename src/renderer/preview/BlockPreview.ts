import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import fragmentShader from '../shaders/block.frag.glsl?raw'
import shadowFragmentShader from '../shaders/shadow.frag.glsl?raw'
import skyFragmentShader from '../shaders/sky.frag.glsl?raw'
import skyVertexShader from '../shaders/sky.vert.glsl?raw'
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
import {
  FLAT_NORMAL,
  MAX_DEPTH,
  METALS,
  metalF0,
  NO_SPECULAR,
  type MetalMode,
  type Rgba
} from '../../shared/labpbr'
import { cornerLight, LightGrid, type CornerLight, type LightProps } from '../../shared/lightLevels'
import { decodePng } from '../../shared/pngCodec'
import {
  gameMipLevels,
  mipOptionsFromMcmeta,
  type MipImage,
  type MipOptions
} from '../../shared/mipmaps'
import { lightingAt, type Lighting } from './dayNight'
import { DEBUG_VIEWS, type EffectSettings, type ToneMappingId } from './effects'
import { MipBloomPass } from './bloomPass'
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
  /** How the block takes part in the scene's light (none: lit as in full daylight, no AO). */
  light?: LightProps
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

/** Shadow map side in texels: the scenes are small, so one map covers the whole world. */
const SHADOW_MAP_SIZE = 2048

/** Face size of the reflection captures (the PMREM blurs it for rough surfaces). */
const ENV_CUBE_SIZE = 256
/** Captures are redone at most this often (ms) while the light or the camera keeps changing. */
const ENV_MIN_INTERVAL = 150
/** The capture follows the camera once its probe moved this far (blocks). */
const ENV_PROBE_MOVE = 0.75

/**
 * Defines for three's textureCubeUV (cube_uv_reflection_fragment) on a PMREM made from a
 * ENV_CUBE_SIZE cube: the same formula as three's WebGLProgram (PMREM height = 4 × cube size).
 */
const ENV_DEFINES = (() => {
  const height = 4 * ENV_CUBE_SIZE
  const maxMip = Math.log2(height) - 2
  return {
    ENVMAP_TYPE_CUBE_UV: '',
    CUBEUV_TEXEL_WIDTH: String(1 / (3 * Math.max(2 ** maxMip, 7 * 16))),
    CUBEUV_TEXEL_HEIGHT: String(1 / height),
    CUBEUV_MAX_MIP: maxMip.toFixed(1)
  }
})()

const TONE_MAPPING: Record<ToneMappingId, THREE.ToneMapping> = {
  neutral: THREE.NeutralToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  none: THREE.NoToneMapping
}

/** `metalMode` uniform of block.frag.glsl. */
const METAL_MODE_INDEX: Record<MetalMode, number> = { spec: 0, albedo: 1, untinted: 2 }

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
    `const float MAX_DEPTH = ${MAX_DEPTH.toFixed(5)};`,
    ''
  ].join('\n')
})()

interface LoadedPart {
  quads: MeshPart['quads']
  /** One copy at the origin, fully lit (held items). The world builds its own, lit per block. */
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
  /** The live canvas and how its mipmaps are made (re-made on every refresh). */
  liveSource: { canvas: HTMLCanvasElement; mip: MipOptions } | null
  /** Its maps drawn from the editor's bytes (re-uploaded with the live texture). */
  liveMaps: THREE.Texture[]
  /** Depth-only material for the shadow pass (null: translucent, casts no shadow). */
  shadowMaterial: THREE.ShaderMaterial | null
}

interface LoadedModel {
  parts: LoadedPart[]
  positions: Vec3[]
  light: LightProps | null
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
  /** World geometry built by layout (disposed on the next one). */
  geometries: THREE.BufferGeometry[]
  /** Sphere around the world, to fit the shadow camera. */
  bounds: THREE.Sphere
  /** Which blocks are solid (from layout), to keep the reflection probe out of them. */
  grid: LightGrid | null
  /** Reflections of this side's world (Effects view), prefiltered by roughness. */
  env: { target: THREE.WebGLRenderTarget | null; probe: THREE.Vector3; dirty: boolean; at: number }
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
    metalMode: { value: 0 },
    skyZenith: { value: new THREE.Color() },
    skyHorizon: { value: new THREE.Color() },
    skyGround: { value: new THREE.Color() },
    torchColor: { value: new THREE.Color() },
    emissionStrength: { value: 0 },
    wetness: { value: 0 },
    pomDepth: { value: 0 },
    pomSamples: { value: 40 },
    pomShadows: { value: true },
    pomSlopes: { value: false },
    rainTime: { value: 0 },
    // Wind on plants (thin planes), like the waving plants of shader packs: 0 = still.
    windStrength: { value: 0 },
    windTime: { value: 0 },
    // Sun (or moon) shadows of the Effects view, rendered for each half before drawing it.
    shadowMode: { value: 0 },
    shadowMap: { value: null as THREE.Texture | null },
    shadowMatrix: { value: new THREE.Matrix4() },
    shadowFromSun: { value: true },
    shadowTexel: { value: 1 / SHADOW_MAP_SIZE },
    shadowRange: { value: 1 },
    // Reflections: 0 = the analytic sky gradient, 1 = the captured scene (envMap, CubeUV).
    envMode: { value: 0 },
    envMap: { value: null as THREE.Texture | null },
    // Screen-space reflections: depth and HDR color of the view rendered without them.
    ssrOn: { value: false },
    ssrDepth: { value: null as THREE.Texture | null },
    ssrColor: { value: null as THREE.Texture | null },
    ssrViewProj: { value: new THREE.Matrix4() },
    ssrPrevViewProj: { value: new THREE.Matrix4() },
    ssrClip: { value: new THREE.Vector2() }
  }
  private capture: {
    cube: THREE.WebGLCubeRenderTarget
    camera: THREE.CubeCamera
    pmrem: THREE.PMREMGenerator
  } | null = null
  /** Gradient sky of the Effects view, centered on whoever looks (camera or capture probe). */
  private readonly skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(150, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: skyVertexShader,
      fragmentShader: skyFragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        skyZenith: this.sharedUniforms.skyZenith,
        skyHorizon: this.sharedUniforms.skyHorizon,
        skyGround: this.sharedUniforms.skyGround
      }
    })
  )
  private shadow: { target: THREE.WebGLRenderTarget; camera: THREE.OrthographicCamera } | null =
    null
  /** LabPBR view (HDR → bloom → tone mapping); null = the vanilla look straight to the screen. */
  private effects: EffectSettings | null = null
  /** One HDR pipeline per half of the view (effects on), or null. */
  private composers: [Composer, Composer] | null = null
  private hour = 12
  private readonly main: Side = emptySide()
  private readonly other: Side = emptySide()
  /** Whether the right half shows the comparison. */
  private comparing = false
  /** The right half shows the same world with POM off (with / without POM comparison). */
  private pomCompare = false
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

    this.scene.add(this.main.world, this.other.world, this.camera, this.skyDome)
    this.skyDome.visible = false
    this.skyDome.renderOrder = -1
    this.skyDome.frustumCulled = false
    this.camera.add(this.main.hand, this.other.hand)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.enablePan = false

    this.setScene('block')
    this.setTime(12)

    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
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
    animation: LiveAnimation | null | undefined = undefined,
    maps: LiveMaps | null = null,
    /** Other textures painted together (the upper half of a tall plant): static, no maps. */
    extras: ReadonlyArray<{ url: string; canvas: HTMLCanvasElement }> = []
  ): void {
    this.liveTextures.clear()
    if (url && canvas) this.liveTextures.set(withoutQuery(url), { canvas, animation, maps })
    for (const extra of extras) {
      this.liveTextures.set(withoutQuery(extra.url), {
        canvas: extra.canvas,
        animation: null,
        maps: null
      })
    }
  }

  refreshLiveTextures(): void {
    for (const part of this.allParts()) {
      if (!part.live) continue
      if (part.liveSource && part.texture instanceof THREE.DataTexture) {
        const pixels = canvasPixels(part.liveSource.canvas)
        if (pixels) {
          reallocateIfResized(part.texture, pixels.width, pixels.height)
          setGameMipmaps(part.texture, pixels, part.liveSource.mip)
        }
      }
      part.texture.needsUpdate = true
      for (const map of part.liveMaps) {
        // The editor may have replaced the bytes (frames added to the map): follow them.
        const pixels = map.userData['livePixels'] as LiveMapPixels | undefined
        if (pixels) map.image = pixelsView(pixels)
        const image = map.image as { width: number; height: number }
        reallocateIfResized(map, image.width, image.height)
        map.needsUpdate = true
      }
    }
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

  /**
   * The current view as PNG bytes (a screenshot). Drawn and read in the same task: the WebGL
   * buffer is not kept between frames.
   */
  screenshot(): Uint8Array {
    this.renderSides(performance.now())
    const url = this.canvas.toDataURL('image/png')
    const base64 = url.slice(url.indexOf(',') + 1)
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  }

  /** Mipmaps like the game: far textures are averaged instead of shimmering. */
  /** Wind on plants (0 = still, 1 = strong), like the waving plants of shader packs. */
  setWind(strength: number): void {
    this.sharedUniforms.windStrength.value = Math.max(0, Math.min(1, strength))
  }

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
    u.metalMode.value = METAL_MODE_INDEX[settings?.metals ?? 'spec']
    u.emissionStrength.value = settings?.emission ?? 0
    u.wetness.value = settings?.rain ?? 0
    u.pomDepth.value = settings?.pom ?? 0
    u.pomSamples.value = settings?.pomSamples ?? 40
    u.pomShadows.value = settings?.pomShadows ?? true
    u.pomSlopes.value = settings?.pomSlopes ?? false
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
    this.skyDome.visible = settings !== null
    this.invalidateReflections()
    this.applyLighting()
  }

  /** Right half without POM: compare the relief side by side (the world must be set twice). */
  setPomCompare(enabled: boolean): void {
    this.pomCompare = enabled
  }

  private invalidateReflections(): void {
    this.main.env.dirty = true
    this.other.env.dirty = true
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
    // The Effects view draws the gradient sky dome instead.
    this.scene.background = this.effects
      ? null
      : new THREE.Color().setRGB(...light.sky, THREE.SRGBColorSpace)
    this.invalidateReflections()
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
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    for (const composer of this.composers ?? []) composer.dispose()
    if (this.shadow) {
      this.shadow.target.depthTexture?.dispose()
      this.shadow.target.dispose()
    }
    if (this.capture) {
      this.capture.cube.dispose()
      this.capture.pmrem.dispose()
    }
    for (const side of [this.main, this.other]) side.env.target?.dispose()
    this.skyDome.geometry.dispose()
    this.skyDome.material.dispose()
    for (const part of this.allParts()) disposePart(part)
    for (const side of [this.main, this.other]) {
      for (const geometry of side.geometries) geometry.dispose()
    }
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
    // The scene may have changed while the textures loaded: lay the mesh out for the current one.
    const mesh = this.main.models[0]
    if (single && mesh) mesh.positions = SCENE_LAYOUTS[this.sceneKind]
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
      loaded: {
        parts: results.map((r) => r.loaded),
        positions: model.positions,
        light: model.light ?? null
      },
      reports: results.map((r) => r.report)
    }
  }

  private async loadPart(part: MeshPart): Promise<{ loaded: LoadedPart; report: PartReport }> {
    let problem: string | null = null
    let texture: THREE.Texture
    const live = part.url ? this.liveTextures.get(withoutQuery(part.url)) : undefined
    // Maps being painted in the editor win over their files.
    const liveNormal = live?.maps?.normal ?? null
    const liveSpecular = live?.maps?.specular ?? null
    const mapsLoading = Promise.all([
      liveNormal ? liveMap(liveNormal) : part.normalUrl ? loadMap(part.normalUrl) : null,
      liveSpecular ? liveMap(liveSpecular) : part.specularUrl ? loadMap(part.specularUrl) : null
    ])
    const liveCanvas = live?.canvas
    // The .png.mcmeta: animation, and how the game makes this texture's mipmaps.
    let mcmeta: unknown = undefined
    if (part.mcmetaUrl) {
      try {
        mcmeta = await (await fetch(part.mcmetaUrl)).json()
      } catch {
        mcmeta = null
      }
    }
    const mip = mipOptionsFromMcmeta(mcmeta, (part.url ?? '').includes('/textures/item/'))
    let mipmapped = true
    let liveSource: LoadedPart['liveSource'] = null
    const canvasImage = liveCanvas ? canvasPixels(liveCanvas) : null
    if (liveCanvas && canvasImage) {
      texture = gameTexture(canvasImage, mip)
      liveSource = { canvas: liveCanvas, mip }
    } else if (part.url) {
      const decoded = await loadPixels(part.url)
      if (decoded) texture = gameTexture(decoded, mip)
      else {
        texture = missingTexture()
        mipmapped = false
        problem = 'Impossibile caricare la texture.'
      }
    } else {
      texture = missingTexture()
      mipmapped = false
      problem = 'Texture mancante: né nel pack né nel gioco.'
    }
    // Pixel art: no smoothing. Mipmaps (made like the game) are only used when enabled.
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = mipmapped ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter
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
        if (mcmeta === null) throw new Error('invalid')
        const parsed = parseAnimation(mcmeta, imageSize.width, imageSize.height)
        if (parsed.ok) {
          animation = parsed.animation
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
      defines: ENV_DEFINES,
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
    const shadowMaterial = part.translucent
      ? null
      : new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader: shadowFragmentShader,
          side: THREE.DoubleSide,
          // Same objects: animation frames and live textures stay in sync.
          uniforms: {
            albedoMap: material.uniforms['albedoMap']!,
            frameA: material.uniforms['frameA']!,
            // Plants sway in the shadow pass too, so their shadows follow them.
            windStrength: this.sharedUniforms.windStrength,
            windTime: this.sharedUniforms.windTime
          }
        })
    const loaded: LoadedPart = {
      quads: part.quads,
      geometry: buildGeometry(part.quads),
      material,
      texture,
      normalMap: normalMap ?? defaultMaps().normal,
      specularMap: specularMap ?? defaultMaps().specular,
      imageSize,
      animation,
      live: liveCanvas !== undefined,
      liveSource,
      liveMaps: [liveNormal && normalMap, liveSpecular && specularMap].filter(
        (map): map is THREE.Texture => Boolean(map)
      ),
      shadowMaterial
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

  /**
   * One mesh per texture of each model, with a copy of its quads at every block position, lit like
   * the game (sky and block light, smooth lighting AO) when the models carry light properties.
   */
  private layout(side: Side): void {
    side.world.clear()
    for (const geometry of side.geometries) geometry.dispose()
    side.geometries = []
    const lit = side.models.flatMap((model) =>
      model.light ? model.positions.map((at) => ({ at, light: model.light! })) : []
    )
    const grid = lit.length > 0 ? new LightGrid(lit) : null
    side.grid = grid
    side.env.dirty = true
    for (const model of side.models) {
      for (const part of model.parts) {
        const geometry = buildGeometry(part.quads, model.positions, grid)
        side.geometries.push(geometry)
        const mesh = new THREE.Mesh(geometry, part.material)
        mesh.userData['shadowMaterial'] = part.shadowMaterial
        side.world.add(mesh)
      }
    }
    const box = new THREE.Box3()
    for (const geometry of side.geometries) {
      geometry.computeBoundingBox()
      if (geometry.boundingBox) box.union(geometry.boundingBox)
    }
    if (box.isEmpty()) side.bounds.set(new THREE.Vector3(), 0)
    else box.getBoundingSphere(side.bounds)
  }

  /**
   * Captures what one side's world reflects: a cube map from a probe near what the camera looks at
   * (moved out of solid blocks), lit like the final image but reflecting only the sky, then
   * prefiltered by roughness (PMREM). Redone when the world, the light or the probe changes.
   */
  private renderReflections(side: Side, now: number): void {
    const u = this.sharedUniforms
    const view = this.effects?.view ?? 0
    if (DEBUG_VIEWS[view]?.raw) return
    if (this.effects?.reflections === 'sky') {
      u.envMode.value = 0
      return
    }
    const probe = this.probePoint(side)
    if (side.env.probe.distanceTo(probe) > ENV_PROBE_MOVE) side.env.dirty = true
    if (side.env.dirty && now - side.env.at >= ENV_MIN_INTERVAL) {
      this.capture ??= (() => {
        const cube = new THREE.WebGLCubeRenderTarget(ENV_CUBE_SIZE, { type: THREE.HalfFloatType })
        return {
          cube,
          camera: new THREE.CubeCamera(0.05, 400, cube),
          pmrem: new THREE.PMREMGenerator(this.renderer)
        }
      })()
      const { cube, camera, pmrem } = this.capture
      for (const s of [this.main, this.other]) {
        s.world.visible = s === side
        s.hand.visible = false
      }
      u.envMode.value = 0
      u.ssrOn.value = false
      this.skyDome.position.copy(probe)
      camera.position.copy(probe)
      camera.update(this.renderer, this.scene)
      side.env.target = pmrem.fromCubemap(cube.texture, side.env.target)
      if ((side.env.target.texture.image as { height: number }).height !== 4 * ENV_CUBE_SIZE) {
        console.warn('PMREM size differs from ENV_DEFINES: reflections will be wrong.')
      }
      side.env.probe.copy(probe)
      side.env.dirty = false
      side.env.at = now
    }
    if (side.env.target) {
      u.envMap.value = side.env.target.texture
      u.envMode.value = 1
    } else {
      u.envMode.value = 0
    }
  }

  /** Where reflections are captured from: the point looked at, pulled towards the camera out of solid blocks. */
  private probePoint(side: Side): THREE.Vector3 {
    const ahead = new THREE.Vector3()
    this.camera.getWorldDirection(ahead)
    const point = this.flying
      ? this.camera.position.clone().addScaledVector(ahead, 3)
      : this.controls.target.clone()
    const back = this.camera.position.clone().sub(point)
    const length = back.length()
    if (length > 0) back.divideScalar(length)
    const solid = (at: THREE.Vector3): boolean =>
      side.grid?.propsAt(Math.round(at.x), Math.round(at.y), Math.round(at.z))?.opaque ?? false
    for (let moved = 0; moved < length && solid(point); moved += 0.25)
      point.addScaledVector(back, 0.25)
    // A little further, so the probe doesn't sit on the face it reflects.
    return point.addScaledVector(back, Math.min(0.3, length))
  }

  /**
   * Renders the shadow map of one side from the sun (or the moon at night), with an orthographic
   * camera around its world, and points the shadow uniforms at it. Off without effects or light.
   */
  private renderShadow(side: Side): void {
    const u = this.sharedUniforms
    const mode = this.effects?.shadows ?? 'off'
    const fromSun = u.sunDirection.value.y > 0
    const color = fromSun ? u.sunColor.value : u.moonColor.value
    const radius = side.bounds.radius
    if (mode === 'off' || radius <= 0 || color.r + color.g + color.b <= 0) {
      u.shadowMode.value = 0
      return
    }
    this.shadow ??= {
      target: new THREE.WebGLRenderTarget(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, {
        depthTexture: new THREE.DepthTexture(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE)
      }),
      camera: new THREE.OrthographicCamera()
    }
    const { target, camera } = this.shadow
    const direction = (fromSun ? u.sunDirection.value : u.moonDirection.value).clone().normalize()
    camera.left = -radius
    camera.right = radius
    camera.top = radius
    camera.bottom = -radius
    camera.near = 0.5
    camera.far = 2 * radius + 1
    camera.up.set(0, Math.abs(direction.y) > 0.99 ? 0 : 1, Math.abs(direction.y) > 0.99 ? 1 : 0)
    camera.position.copy(side.bounds.center).addScaledVector(direction, radius + 0.5)
    camera.lookAt(side.bounds.center)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()

    for (const s of [this.main, this.other]) {
      s.world.visible = s === side
      s.hand.visible = false
    }
    this.drawDepth(side, target, camera)

    u.shadowMap.value = target.depthTexture
    u.shadowMatrix.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    u.shadowFromSun.value = fromSun
    u.shadowRange.value = camera.far - camera.near
    u.shadowMode.value = mode === 'pixel' ? 2 : 1
  }

  /**
   * Draws only the depth of a side's world into `target` (shadow map, SSR prepass): opaque and
   * cutout parts with their depth material, translucent ones left out. Visibility is the caller's.
   */
  private drawDepth(side: Side, target: THREE.WebGLRenderTarget, camera: THREE.Camera): void {
    const swapped: Array<[THREE.Mesh, THREE.Material]> = []
    for (const child of side.world.children) {
      if (!(child instanceof THREE.Mesh)) continue
      const caster = child.userData['shadowMaterial'] as THREE.ShaderMaterial | null
      swapped.push([child, child.material as THREE.Material])
      if (caster) child.material = caster
      else child.visible = false
    }
    const dome = this.skyDome.visible
    this.skyDome.visible = false
    this.renderer.setRenderTarget(target)
    this.renderer.clear()
    this.renderer.render(this.scene, camera)
    this.renderer.setRenderTarget(null)
    this.skyDome.visible = dome
    for (const [mesh, material] of swapped) {
      mesh.material = material
      mesh.visible = true
    }
  }

  /**
   * Screen-space reflections for one half: first the same view WITHOUT SSR (reflections from the
   * capture only) into the composer's `base` target, color + depth; the final pass marches in that
   * depth and takes the reflected color from it. Reading a frame that already had SSR would chain
   * mirror-in-mirror reflections forever (black inner corners): this way it's two bounces at most,
   * the second from the capture, and there's no frame of lag. Off for raw views and "sky only".
   */
  private prepareSsr(side: Side, composer: Composer): void {
    const u = this.sharedUniforms
    const raw = DEBUG_VIEWS[this.effects?.view ?? 0]?.raw ?? false
    if (raw || this.effects?.reflections !== 'scene') {
      u.ssrOn.value = false
      return
    }
    u.ssrOn.value = false
    // Unbind last frame's SSR inputs: they ARE composer.base, and sampling the target being drawn
    // is a feedback loop (WebGL skips the draw, SSR then silently shows only the capture).
    u.ssrDepth.value = null
    u.ssrColor.value = null
    side.hand.visible = false
    this.renderer.setRenderTarget(composer.base)
    this.renderer.clear()
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    side.hand.visible = true
    this.camera.updateMatrixWorld()
    u.ssrViewProj.value.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    )
    u.ssrPrevViewProj.value.copy(u.ssrViewProj.value)
    u.ssrDepth.value = composer.base.depthTexture
    u.ssrColor.value = composer.base.texture
    u.ssrClip.value.set(this.camera.near, this.camera.far)
    u.ssrOn.value = true
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
   * The GPU dropped the WebGL context (driver reset, sleep, too many contexts) and gave it back.
   * three.js rebuilds its GL state and re-uploads textures and targets on the next frame; the
   * shadow map is drawn every frame anyway. Only the reflection capture lived on the GPU alone.
   */
  private onContextRestored = (): void => {
    this.invalidateReflections()
  }

  /**
   * Draws the scene, the two halves side by side when comparing. With the effects on, each half
   * goes through its own HDR composer, so one half's bloom can't spill into the other.
   */
  private renderSides(now: number): void {
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
      this.sharedUniforms.pomDepth.value = i === 1 && this.pomCompare ? 0 : (this.effects?.pom ?? 0)
      if (this.composers) {
        this.renderShadow(side)
        this.renderReflections(side, now)
        this.skyDome.position.copy(this.camera.position)
      }
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
      if (composer) {
        composer.setSize(width, size.y)
        this.prepareSsr(side, composer)
        composer.render()
      } else {
        this.renderer.render(this.scene, this.camera)
      }
    })
    this.renderer.setScissorTest(false)
  }

  private loop = (now: number = performance.now()): void => {
    if (this.disposed) return
    const seconds = (now - this.lastFrame) / 1000
    this.lastFrame = now
    const ticks = ((now - this.animationStart) / 1000) * TICKS_PER_SECOND
    for (const part of this.allParts()) if (part.animation) setAnimatedFrame(part, ticks)
    this.sharedUniforms.rainTime.value = now / 1000
    this.sharedUniforms.windTime.value = now / 1000
    if (this.flying) this.fly(seconds)
    else this.controls.update()
    this.renderSides(now)
    this.frame = requestAnimationFrame(this.loop)
  }
}

/**
 * HDR pipeline of the Effects view: scene → bloom → exposure, tone mapping and sRGB, drawn into
 * the renderer's current viewport (one half of the screen when comparing).
 */
class Composer {
  readonly bloom = new MipBloomPass()
  /**
   * The view without screen-space reflections (SSR reads it): HDR color with mipmaps (blurrier
   * reflections on rough surfaces) and depth.
   */
  readonly base = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    depthTexture: new THREE.DepthTexture(1, 1)
  })
  private readonly composer: EffectComposer
  private readonly output = new OutputPass()
  private readonly size = new THREE.Vector2()

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    // Half floats keep lights and emission above 1 for the bloom; 4× MSAA like the screen.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(renderer, target)
    this.composer.addPass(new DrawPass(scene, camera))
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.output)
  }

  /** `width` × `height` in CSS pixels, the size of the viewport it ends in. */
  setSize(width: number, height: number): void {
    if (this.size.x === width && this.size.y === height) return
    this.size.set(width, height)
    this.composer.setSize(width, height)
    const ratio = this.renderer.getPixelRatio()
    const w = Math.max(1, Math.floor(width * ratio))
    const h = Math.max(1, Math.floor(height * ratio))
    this.base.setSize(w, h)
  }

  render(): void {
    this.composer.render()
  }

  dispose(): void {
    this.bloom.dispose()
    this.output.dispose()
    this.composer.dispose()
    this.base.depthTexture?.dispose()
    this.base.dispose()
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
  return {
    models: [],
    held: [],
    world: new THREE.Group(),
    hand: new THREE.Group(),
    geometries: [],
    bounds: new THREE.Sphere(),
    grid: null,
    env: { target: null, probe: new THREE.Vector3(Infinity, 0, 0), dirty: true, at: 0 }
  }
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

/**
 * Two counter-clockwise triangles per quad, in block units, a copy centered on each block position.
 * With a light grid, each corner gets the game's smooth light (sky, block, AO); faces pressed
 * against an opaque block are skipped, and quads are split along their darker diagonal (0fps).
 */
function buildGeometry(
  quads: MeshPart['quads'],
  blocks: readonly Vec3[] = [[0, 0, 0]],
  grid: LightGrid | null = null
): THREE.BufferGeometry {
  const positions: number[] = []
  const lights: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const tints: number[] = []
  const rights: number[] = []
  const downs: number[] = []
  const thins: number[] = []
  const sways: number[] = []
  // Corners are TL, TR, BR, BL seen from outside: TL-BL-BR and TL-BR-TR face outwards
  // (split along TL-BR), or TL-BL-TR and TR-BL-BR (split along TR-BL).
  const order = [0, 3, 2, 0, 2, 1]
  const flipped = [0, 3, 1, 1, 3, 2]
  const daylight: CornerLight = { sky: 15, block: 0, ao: 1 }
  for (const at of blocks) {
    for (const { quad, tint } of quads) {
      const side = boundarySide(quad)
      if (grid && side && grid.propsAt(at[0] + side[0], at[1] + side[1], at[2] + side[2])?.opaque) {
        continue
      }
      const corners = quad.positions.map((corner) =>
        grid ? cornerLight(grid, at, quad.normal, corner, side !== null) : daylight
      )
      const weight = (c: CornerLight): number => c.ao * (1 + Math.max(c.sky, c.block) / 15)
      const [w0, w1, w2, w3] = corners.map(weight) as [number, number, number, number]
      const axes = textureAxes(quad)
      for (const i of w0 + w2 > w1 + w3 ? flipped : order) {
        rights.push(...axes.right)
        thins.push(quad.thin ? 1 : 0)
        downs.push(...axes.down)
        const p = quad.positions[i]!
        const uv = quad.uvs[i]!
        const light = corners[i]!
        lights.push(light.sky / 15, light.block / 15, light.ao)
        // Plants sway more towards their top (their base stays in the ground), each block with
        // its own phase so the whole plant moves together.
        sways.push(quad.thin ? Math.max(0, Math.min(1, p[1] / 16)) : 0, at[0] * 0.9 + at[2] * 0.6)
        positions.push(p[0] / 16 - 0.5 + at[0], p[1] / 16 - 0.5 + at[1], p[2] / 16 - 0.5 + at[2])
        normals.push(...quad.normal)
        uvs.push(uv[0] / 16, 1 - uv[1] / 16)
        // Albedo is decoded to linear on sampling; the game multiplies tint and
        // texture in sRGB, which matches linear(albedo) × linear(tint) here.
        tints.push(srgbToLinear(tint[0]), srgbToLinear(tint[1]), srgbToLinear(tint[2]))
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('tint', new THREE.Float32BufferAttribute(tints, 3))
  geometry.setAttribute('texRight', new THREE.Float32BufferAttribute(rights, 3))
  geometry.setAttribute('texDown', new THREE.Float32BufferAttribute(downs, 3))
  geometry.setAttribute('lightLevels', new THREE.Float32BufferAttribute(lights, 3))
  geometry.setAttribute('thinPlane', new THREE.Float32BufferAttribute(thins, 1))
  geometry.setAttribute('sway', new THREE.Float32BufferAttribute(sways, 2))
  return geometry
}

/** The block side a quad lies on (unit step towards the neighbour), or null when inside it. */
function boundarySide(quad: Quad): Vec3 | null {
  const axis = quad.normal.findIndex((c) => Math.abs(c) > 0.999)
  if (axis < 0) return null
  const plane = quad.normal[axis]! > 0 ? 16 : 0
  if (!quad.positions.every((corner) => Math.abs(corner[axis]! - plane) < 1e-6)) return null
  const side: Vec3 = [0, 0, 0]
  side[axis] = Math.sign(quad.normal[axis]!)
  return side
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

/** LabPBR maps being edited (straight RGBA, updated in place); null = use the file. */
export interface LiveMaps {
  normal: LiveMapPixels | null
  specular: LiveMapPixels | null
}

export interface LiveMapPixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

interface LiveSource {
  canvas: HTMLCanvasElement
  /** undefined = use the file's .png.mcmeta. */
  animation: LiveAnimation | null | undefined
  maps: LiveMaps | null
}

function withoutQuery(url: string): string {
  const index = url.indexOf('?')
  return index === -1 ? url : url.slice(0, index)
}

/** A texture's straight RGBA, decoded exactly (the browser's decoder premultiplies), or null. */
async function loadPixels(url: string): Promise<MipImage | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const decoded = decodePng(new Uint8Array(await response.arrayBuffer()))
    if (!decoded.ok) return null
    const { width, height, data } = decoded.image
    return { width, height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }
  } catch {
    return null
  }
}

/**
 * The pixels of the editor's canvas. Read back from a 2D canvas (premultiplied): only the
 * colour of partly transparent pixels may shift a unit, fine for the preview's mipmaps.
 */
function canvasPixels(canvas: HTMLCanvasElement): MipImage | null {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || canvas.width === 0 || canvas.height === 0) return null
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(data.buffer) }
}

/**
 * Mip levels like the game (shared/mipmaps.ts), then plain halvings down to 1×1, which WebGL
 * needs for a complete texture (those are never sampled: the shader caps the level).
 */
function setGameMipmaps(texture: THREE.DataTexture, pixels: MipImage, mip: MipOptions): void {
  const levels = gameMipLevels(pixels, 16, mip)
  let last = levels.at(-1)!
  while (last.width > 1 || last.height > 1) {
    const width = Math.max(1, last.width >> 1)
    const height = Math.max(1, last.height >> 1)
    const data = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from =
          (Math.min(last.width - 1, x * 2) + Math.min(last.height - 1, y * 2) * last.width) * 4
        data.set(last.data.subarray(from, from + 4), (x + y * width) * 4)
      }
    }
    last = { width, height, data }
    levels.push(last)
  }
  texture.image = { data: levels[0]!.data, width: pixels.width, height: pixels.height }
  texture.mipmaps = levels.map(({ data, width, height }) => ({ data, width, height }))
}

/**
 * WebGL can't resize an allocated texture: uploading a bigger or smaller image into it fails
 * (GL_INVALID_VALUE, the preview keeps the old pixels). When the editor's canvas changes size
 * (frames added or removed), the GPU copy is released first and made again at the new size.
 */
function reallocateIfResized(texture: THREE.Texture, width: number, height: number): void {
  const size = `${width}×${height}`
  const before = texture.userData['uploadedSize'] as string | undefined
  if (before !== undefined && before !== size) texture.dispose()
  texture.userData['uploadedSize'] = size
}

/** An albedo texture with mipmaps made like the game. */
function gameTexture(pixels: MipImage, mip: MipOptions): THREE.DataTexture {
  const texture = new THREE.DataTexture(pixels.data, pixels.width, pixels.height)
  // Same orientation as the maps and the UVs (images loaded by the browser are flipped).
  texture.flipY = true
  texture.generateMipmaps = false
  setGameMipmaps(texture, pixels, mip)
  reallocateIfResized(texture, pixels.width, pixels.height)
  texture.needsUpdate = true
  return texture
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
  part.shadowMaterial?.dispose()
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

/** The editor's map bytes as a texture image (no copy). */
function pixelsView(pixels: LiveMapPixels): { width: number; height: number; data: Uint8Array } {
  const { width, height, data } = pixels
  return { width, height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) }
}

/** A map being edited: a texture over the editor's own bytes (refreshLiveTextures re-uploads). */
function liveMap(pixels: LiveMapPixels): MapResult {
  const { width, height, data } = pixelsView(pixels)
  const texture = new THREE.DataTexture(data, width, height)
  texture.userData['livePixels'] = pixels
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
