// README GIF "Sections" (see readme-kit.mjs): the hotbar walked with the keys 1-9 on the fixture
// pack plus a few textures of our own in every section shown. GUI and Screens are left out: their
// mock screens draw the game's title art. English interface, no captions.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { png } from '../fixtures.mjs'
import { recorder } from './readme-kit.mjs'

export const options = { language: 'en' }

const shade = (rgb, x, y) => rgb.map((c) => c - ((x * 7 + y * 13) % 11)).concat(255)

/** pack path (under textures/) → [width, height, base colour, transparent outside a circle?] */
const TEXTURES = {
  'item/apple.png': [16, 16, [200, 40, 50], true],
  'item/diamond.png': [16, 16, [80, 220, 230], true],
  'item/iron_sword.png': [16, 16, [200, 200, 215], true],
  'item/bread.png': [16, 16, [190, 140, 70], true],
  'entity/equipment/humanoid/iron.png': [64, 32, [150, 160, 175], false],
  'entity/equipment/humanoid/gold.png': [64, 32, [230, 190, 60], false],
  'entity/equipment/humanoid_leggings/iron.png': [64, 32, [120, 130, 150], false],
  'entity/zombie/zombie.png': [64, 64, [80, 130, 60], false],
  'entity/zombie/husk.png': [64, 64, [150, 130, 90], false],
  'entity/cow/cow.png': [64, 64, [90, 60, 40], false],
  'colormap/grass.png': [256, 256, null, false],
  'colormap/foliage.png': [256, 256, null, false],
  'environment/sun.png': [32, 32, [250, 220, 90], true]
}

export default async function tour(app) {
  const frame = recorder(app)
  for (const [path, [width, height, rgb, round]] of Object.entries(TEXTURES)) {
    const file = join(app.paths.pack, 'assets', 'minecraft', 'textures', path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(
      file,
      png(width, height, (x, y) => {
        // Colormaps: a temperature × downfall gradient.
        if (!rgb) return [60 + (x >> 2), 180 - (y >> 2), 50, 255]
        if (round && (x - width / 2 + 0.5) ** 2 + (y - height / 2 + 0.5) ** 2 > (width / 2.4) ** 2)
          return [0, 0, 0, 0]
        return shade(rgb, x, y)
      })
    )
  }
  await app.openPack()
  await frame(1400, 800)
  for (const key of ['2', '3', '4', '5', '8', '1']) {
    await app.key(key)
    await frame(key === '1' ? 1400 : 900, 700)
  }
}
