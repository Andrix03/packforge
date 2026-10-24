import { describe, expect, it } from 'vitest'
import { armorBoxes, armorLayerOf, boxMesh, companionLayerPath, isDyeableArmor } from './armorModel'

describe('armor model', () => {
  it('knows the two humanoid equipment layers', () => {
    const base = 'assets/minecraft/textures/entity/equipment/'
    expect(armorLayerOf(`${base}humanoid/diamond.png`)).toBe('humanoid')
    expect(armorLayerOf(`${base}humanoid_leggings/iron.png`)).toBe('humanoid_leggings')
    expect(armorLayerOf(`${base}wings/elytra.png`)).toBeNull()
    expect(armorLayerOf('assets/minecraft/textures/block/stone.png')).toBeNull()
  })

  it('draws every part on the outer layer, inflated by 1 (the hat by 1.5)', () => {
    const boxes = armorBoxes('humanoid')
    expect(boxes.map((b) => b.part)).toEqual([
      'head',
      'hat',
      'body',
      'right_arm',
      'left_arm',
      'right_leg',
      'left_leg'
    ])
    expect(boxes.find((b) => b.part === 'body')?.inflate).toBe(1)
    expect(boxes.find((b) => b.part === 'hat')?.inflate).toBe(1.5)
    // The head's face on the texture, as the game unfolds the 8×8×8 box at (0, 0).
    expect(boxes[0]?.faces.front).toEqual({ x: 8, y: 8, width: 8, height: 8 })
  })

  it('draws the body and the legs on the leggings layer, inflated by 0.5', () => {
    const boxes = armorBoxes('humanoid_leggings')
    expect(boxes.map((b) => b.part)).toEqual(['body', 'right_leg', 'left_leg'])
    expect(boxes.every((b) => b.inflate === 0.5)).toBe(true)
    expect(boxes.find((b) => b.part === 'left_leg')?.mirror).toBe(true)
  })

  it('pairs the two layers and spots leather', () => {
    const base = 'assets/minecraft/textures/entity/equipment/'
    expect(companionLayerPath(`${base}humanoid/iron.png`)).toBe(`${base}humanoid_leggings/iron.png`)
    expect(companionLayerPath(`${base}humanoid_leggings/iron.png`)).toBe(`${base}humanoid/iron.png`)
    expect(isDyeableArmor(`${base}humanoid/leather.png`)).toBe(true)
    expect(isDyeableArmor(`${base}humanoid/leather_overlay.png`)).toBe(false)
  })

  it('builds inflated boxes with the faces mapped like the game', () => {
    const [head] = armorBoxes('humanoid')
    const mesh = boxMesh(head!)
    expect(mesh.positions.length).toBe(6 * 4 * 3)
    expect(mesh.indices.length).toBe(6 * 6)
    const xs = mesh.positions.filter((_, i) => i % 3 === 0)
    expect(Math.min(...xs)).toBe(-5)
    expect(Math.max(...xs)).toBe(5)
    // Front face (first): bottom-left corner at the wearer's right, u 8/64, v 16/32.
    expect(mesh.positions.slice(0, 3)).toEqual([-5, 23, 5])
    expect(mesh.uvs.slice(0, 2)).toEqual([8 / 64, 16 / 32])
  })

  it('mirrors the left limbs: sides swapped, faces flipped', () => {
    const boxes = armorBoxes('humanoid_leggings')
    const right = boxMesh(boxes.find((b) => b.part === 'right_leg')!)
    const left = boxMesh(boxes.find((b) => b.part === 'left_leg')!)
    // Front face u runs the other way.
    expect(left.uvs.slice(0, 4)).toEqual([right.uvs[2], right.uvs[1], right.uvs[0], right.uvs[3]])
    // The left leg's outer (+x) face shows the right leg's outer (right) rectangle.
    const outer = (mesh: typeof left, face: number): number[] =>
      mesh.uvs.slice(face * 8, face * 8 + 8)
    expect([...outer(left, 3)].sort()).toEqual([...outer(right, 2)].sort())
  })

  it('keeps every face inside the 64×32 texture', () => {
    for (const box of [...armorBoxes('humanoid'), ...armorBoxes('humanoid_leggings')]) {
      for (const face of Object.values(box.faces)) {
        expect(face.x + face.width, box.part).toBeLessThanOrEqual(64)
        expect(face.y + face.height, box.part).toBeLessThanOrEqual(32)
      }
    }
  })
})
