import { describe, expect, it } from 'vitest'
import { faceCorners, textureAxes, type Quad } from './blockGeometry'

const full = [
  [0, 0, 0],
  [16, 16, 16]
] as const

// Default UVs of a full face: TL, TR, BR, BL.
const uvs: Quad['uvs'] = [
  [0, 0],
  [16, 0],
  [16, 16],
  [0, 16]
]

describe('textureAxes', () => {
  it('points right and down along the image on a side face', () => {
    // North face seen from the north: +X is on the left, so the image's right is -X.
    const axes = textureAxes({
      positions: faceCorners('north', [...full[0]], [...full[1]]),
      uvs,
      normal: [0, 0, -1]
    })
    expect(axes.right).toEqual([-1, 0, 0])
    expect(axes.down).toEqual([0, -1, 0])
  })

  it('follows rotated UVs', () => {
    // UVs turned 90° clockwise: the image's right now runs down the face.
    const rotated: Quad['uvs'] = [uvs[3], uvs[0], uvs[1], uvs[2]]
    const axes = textureAxes({
      positions: faceCorners('south', [...full[0]], [...full[1]]),
      uvs: rotated,
      normal: [0, 0, 1]
    })
    expect(axes.right).toEqual([0, -1, 0])
    expect(axes.down).toEqual([-1, 0, 0])
  })

  it('falls back to the quad edges when the UVs have no area', () => {
    const flat: Quad['uvs'] = [
      [3, 0],
      [3, 0],
      [3, 16],
      [3, 16]
    ]
    const axes = textureAxes({
      positions: faceCorners('south', [...full[0]], [...full[1]]),
      uvs: flat,
      normal: [0, 0, 1]
    })
    expect(axes.right).toEqual([1, 0, 0])
    expect(axes.down).toEqual([0, -1, 0])
  })
})
