import { describe, expect, it } from 'vitest'
import { armorBoxes } from './armorModel'
import { mobModelOf } from './mobModel'

const Z = 'assets/minecraft/textures/entity/zombie/'

describe('mobModelOf', () => {
  it('knows the humanoid zombies only', () => {
    expect(mobModelOf(`${Z}zombie.png`)?.mob).toBe('zombie')
    expect(mobModelOf(`${Z}husk.png`)?.scale).toBe(1.0625)
    expect(mobModelOf(`${Z}drowned.png`)?.mob).toBe('drowned')
    expect(mobModelOf(`${Z}drowned_outer_layer.png`)).toBeNull()
    // Random variants (OptiFine / ETF) use the same model.
    expect(mobModelOf('assets/minecraft/optifine/random/entity/zombie/zombie2.png')?.mob).toBe(
      'zombie'
    )
    expect(mobModelOf('assets/minecraft/textures/entity/cow/cow.png')).toBeNull()
  })

  it('is the player shape with no armor inflation, on a 64×64 texture', () => {
    const zombie = mobModelOf(`${Z}zombie.png`)!
    expect(zombie.textureHeight).toBe(64)
    const armor = armorBoxes('humanoid')
    for (const box of zombie.boxes) {
      const same = armor.find((a) => a.part === box.part)!
      expect(box.from).toEqual(same.from)
      expect(box.size).toEqual(same.size)
      expect(box.inflate).toBe(box.part === 'hat' ? 0.5 : 0)
    }
  })

  it('gives the drowned its own left limbs', () => {
    const drowned = mobModelOf(`${Z}drowned.png`)!
    const leftArm = drowned.boxes.find((b) => b.part === 'left_arm')!
    expect(leftArm.mirror).toBe(false)
    expect(leftArm.faces.front).not.toEqual(
      drowned.boxes.find((b) => b.part === 'right_arm')!.faces.front
    )
    const zombieLeft = mobModelOf(`${Z}zombie.png`)!.boxes.find((b) => b.part === 'left_arm')!
    expect(zombieLeft.mirror).toBe(true)
  })
})
