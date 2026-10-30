// The 3D model of the mobs PackForge can preview: the humanoid zombies. Checked on the 26.3 client
// (LayerDefinitions.createRoots): ZOMBIE = HumanoidModel.createMesh(NONE, 0) on a 64×64 texture,
// HUSK the same scaled by 1.0625, DROWNED its own createBodyLayer, which gives the left arm and leg
// their own texture (32, 48 and 16, 48) instead of mirroring the right ones. Pure.
import type { ArmorBox, BoxFace } from './armorModel'
import { boxFaces } from './equipment'

export interface MobModel {
  /** Which mob, for the label. */
  mob: 'zombie' | 'husk' | 'drowned'
  boxes: ArmorBox[]
  textureWidth: number
  textureHeight: number
  /** The whole model's scale (the husk is a bigger zombie). */
  scale: number
}

const MODELS: Readonly<Record<string, Pick<MobModel, 'mob' | 'scale'>>> = {
  zombie: { mob: 'zombie', scale: 1 },
  husk: { mob: 'husk', scale: 1.0625 },
  drowned: { mob: 'drowned', scale: 1 }
}

/** The model of a mob texture (`entity/zombie/zombie.png`…), or null when it has none here. */
export function mobModelOf(path: string): MobModel | null {
  // The texture itself, or one of its OptiFine / ETF random variants (zombie2.png…).
  const m =
    /^assets\/[^/]+\/(?:textures|optifine\/random)\/entity\/zombie\/(zombie|husk|drowned)\d*\.png$/.exec(
      path
    )
  const known = m ? MODELS[m[1] ?? ''] : undefined
  if (!known) return null
  const box = (
    part: string,
    from: [number, number, number],
    size: [number, number, number],
    uv: [number, number],
    inflate = 0,
    mirror = false
  ): ArmorBox => ({
    part,
    from,
    size,
    inflate,
    faces: boxFaces(uv[0], uv[1], size[0], size[1], size[2]) as Record<BoxFace, UvRect>,
    mirror
  })
  const drowned = known.mob === 'drowned'
  // Feet at y 0 like the armor model: legs 0–12, body 12–24, head 24–32, arms at the shoulders.
  const boxes = [
    box('head', [-4, 24, -4], [8, 8, 8], [0, 0]),
    box('hat', [-4, 24, -4], [8, 8, 8], [32, 0], 0.5),
    box('body', [-4, 12, -2], [8, 12, 4], [16, 16]),
    box('right_arm', [-8, 12, -2], [4, 12, 4], [40, 16]),
    drowned
      ? box('left_arm', [4, 12, -2], [4, 12, 4], [32, 48])
      : box('left_arm', [4, 12, -2], [4, 12, 4], [40, 16], 0, true),
    box('right_leg', [-4, 0, -2], [4, 12, 4], [0, 16]),
    drowned
      ? box('left_leg', [0, 0, -2], [4, 12, 4], [16, 48])
      : box('left_leg', [0, 0, -2], [4, 12, 4], [0, 16], 0, true)
  ]
  return { ...known, boxes, textureWidth: 64, textureHeight: 64 }
}

type UvRect = ArmorBox['faces'][BoxFace]
