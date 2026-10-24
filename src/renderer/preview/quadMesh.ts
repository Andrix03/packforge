// Model quads (shared/blockGeometry) as three.js geometry, for the small item and model views.
import * as THREE from 'three'
import type { Quad } from '../../shared/blockGeometry'

/** Rows of the first frame of an animated strip (square frames), else the whole height. */
export function frameHeight(image: { width: number; height: number }): number {
  return image.height > image.width && image.height % image.width === 0 ? image.width : image.height
}

/** Quads as triangles, model space (0–16) to block units centred on 0. */
export function geometryOf(quads: Quad[], frame: number): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const normals: number[] = []
  for (const quad of quads) {
    for (const i of [0, 3, 2, 0, 2, 1]) {
      const p = quad.positions[i]!
      positions.push(p[0] / 16 - 0.5, p[1] / 16 - 0.5, p[2] / 16 - 0.5)
      const uv = quad.uvs[i]!
      uvs.push(uv[0] / 16, (uv[1] / 16) * frame)
      normals.push(...quad.normal)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return geometry
}
