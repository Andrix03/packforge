import * as THREE from 'three'
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import fragmentShader from '../shaders/bloom.frag.glsl?raw'
import vertexShader from '../shaders/fullscreen.vert.glsl?raw'

/** Levels of the bloom pyramid, each half the previous (Photon uses 6). */
const LEVELS = 6
/** Photon's bloom_intensity = 0.12 × BLOOM_INTENSITY: the scene keeps 88% at strength 1. */
const MIX_PER_STRENGTH = 0.12
/** Photon's upsample weight mix(0.25, 0.90, 0.5 × BLOOM_SPREAD) at BLOOM_SPREAD = 1. */
const SPREAD = 0.575

/**
 * Threshold-free bloom like Photon: the whole HDR image is blurred through a mip pyramid and a
 * little of it mixed back, so only really bright things (emission, the sun) visibly glow and mid
 * tones get no halo. Replaces three's UnrealBloomPass (threshold + wide gaussian halo).
 */
export class MipBloomPass extends Pass {
  /** Bloom strength (1 = Photon's default). */
  strength = 1
  private readonly down: THREE.WebGLRenderTarget[] = []
  private readonly up: THREE.WebGLRenderTarget[] = []
  private readonly material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      bloomStep: { value: 0 },
      source: { value: null as THREE.Texture | null },
      texel: { value: new THREE.Vector2() },
      detail: { value: null as THREE.Texture | null },
      spread: { value: SPREAD },
      scene: { value: null as THREE.Texture | null },
      strength: { value: 0 }
    }
  })
  private readonly quad = new FullScreenQuad(this.material)

  constructor() {
    super()
    const options = { type: THREE.HalfFloatType, depthBuffer: false }
    for (let i = 0; i < LEVELS; i++) {
      this.down.push(new THREE.WebGLRenderTarget(1, 1, options))
      this.up.push(new THREE.WebGLRenderTarget(1, 1, options))
    }
  }

  override setSize(width: number, height: number): void {
    let w = width
    let h = height
    for (let i = 0; i < LEVELS; i++) {
      w = Math.max(1, Math.floor(w / 2))
      h = Math.max(1, Math.floor(h / 2))
      this.down[i]!.setSize(w, h)
      this.up[i]!.setSize(w, h)
    }
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    const u = this.material.uniforms
    /**
     * One step into `target`. Every sampler is set each time (unused ones to null): a sampler
     * still bound to the target being drawn is a feedback loop, and WebGL silently skips the draw.
     */
    const draw = (
      target: THREE.WebGLRenderTarget | null,
      step: number,
      source: THREE.WebGLRenderTarget,
      detail: THREE.Texture | null = null,
      scene: THREE.Texture | null = null
    ): void => {
      u['bloomStep']!.value = step
      u['source']!.value = source.texture
      u['texel']!.value.set(1 / source.width, 1 / source.height)
      u['detail']!.value = detail
      u['scene']!.value = scene
      renderer.setRenderTarget(target)
      this.quad.render(renderer)
    }
    // Down: full image → half → quarter…
    let source: THREE.WebGLRenderTarget = readBuffer
    for (const target of this.down) {
      draw(target, 0, source)
      source = target
    }
    // Up: each level blended over the downsample of the same size, from the smallest.
    let smaller = this.down[LEVELS - 1]!
    for (let i = LEVELS - 2; i >= 0; i--) {
      draw(this.up[i]!, 1, smaller, this.down[i]!.texture)
      smaller = this.up[i]!
    }
    // Composite into the write buffer (the composer swaps it in).
    u['strength']!.value = Math.min(1, this.strength * MIX_PER_STRENGTH)
    draw(this.renderToScreen ? null : writeBuffer, 2, smaller, null, readBuffer.texture)
  }

  override dispose(): void {
    for (const target of [...this.down, ...this.up]) target.dispose()
    this.material.dispose()
    this.quad.dispose()
  }
}
