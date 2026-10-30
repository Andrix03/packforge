// README GIF "Armour and trims" (see readme-kit.mjs): our own textures, English interface, no captions.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'
import { recorder, turn } from './readme-kit.mjs'

export const options = { language: 'en' }

async function textures(app) {
  const at = (...p) => join(app.paths.pack, 'assets', 'minecraft', ...p)
  await mkdir(at('textures', 'gui', 'sprites', 'widget'), { recursive: true })
  await mkdir(at('textures', 'entity', 'equipment', 'humanoid'), { recursive: true })
  await mkdir(at('textures', 'entity', 'equipment', 'humanoid_leggings'), { recursive: true })
  await mkdir(at('textures', 'trims', 'entity', 'humanoid'), { recursive: true })
  await mkdir(at('textures', 'palettes', 'trim'), { recursive: true })

  // A bevelled stone button with a gold frame.
  await writeFile(
    at('textures', 'gui', 'sprites', 'widget', 'button.png'),
    png(200, 20, (x, y) =>
      x < 1 || y < 1 || x > 198 || y > 18
        ? [40, 30, 10, 255]
        : x < 3 || y < 3 || x > 196 || y > 16
          ? [214, 170, 60, 255]
          : [88 + ((x * 7 + y * 13) % 9), 92 + ((x * 5 + y * 3) % 7), 104, 255]
    )
  )
  await writeFile(
    at('textures', 'gui', 'sprites', 'widget', 'button.png.mcmeta'),
    JSON.stringify({ gui: { scaling: { type: 'nine_slice', width: 200, height: 20, border: 3 } } })
  )
  // Steel armour with darker seams, and leggings.
  const armor = (base) =>
    png(64, 32, (x, y) => {
      const used = y < 16 || x < 56
      if (!used) return [0, 0, 0, 0]
      const seam = x % 8 === 0 || y % 8 === 0
      const v = (x * 11 + y * 7) % 13
      return seam ? base.map((c) => c * 0.55).concat(255) : base.map((c) => c - v).concat(255)
    })
  await writeFile(
    at('textures', 'entity', 'equipment', 'humanoid', 'iron.png'),
    armor([150, 160, 175])
  )
  await writeFile(
    at('textures', 'entity', 'equipment', 'humanoid_leggings', 'iron.png'),
    armor([120, 130, 150])
  )
  // Trim: our own base palette (8 greys), a chevron pattern and an emerald-like material.
  await writeFile(
    at('textures', 'palettes', 'trim_base.png'),
    png(8, 1, (x) => [224 - x * 32, 224 - x * 32, 224 - x * 32, 255])
  )
  await writeFile(
    at('textures', 'trims', 'entity', 'humanoid', 'chevron.png'),
    png(64, 32, (x, y) => {
      const chest =
        x >= 20 && x < 28 && y >= 20 && y < 32 && Math.floor(Math.abs(x - 23.5)) + 20 === y - 1
      const brow = x >= 8 && x < 16 && y === 9
      const boots = y === 29 && x < 16
      return chest || brow || boots
        ? [224, 224, 224, 255]
        : x >= 20 && x < 28 && y === 22
          ? [160, 160, 160, 255]
          : [0, 0, 0, 0]
    })
  )
  await writeFile(
    at('textures', 'palettes', 'trim', 'jade.png'),
    png(8, 1, (x) => [40, 240 - x * 25, 110, 255])
  )
}

export default async function tour(app) {
  const frame = recorder(app)
  await textures(app)
  await app.openPack()
  await app.section('armor')
  await app.waitFor(
    `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('/iron.png'))`
  )
  await app.openTexture('iron.png')
  await app.waitFor(`document.querySelector('.armor-preview canvas')`)
  await frame(1500, 900)
  // Paint a stripe on the chestplate: the player wears it at once.
  await app.editor.setHex('#d4af37')
  for (let x = 20; x < 28; x += 2) {
    await app.editor.draw([
      [x, 22],
      [x + 1, 22]
    ])
    await frame(250, 150)
  }
  await app.setValue('.armor-choices label:nth-child(1) select', 'chevron')
  await app.waitFor(`document.querySelectorAll('.armor-choices select').length === 2`)
  await app.setValue('.armor-choices label:nth-child(2) select', 'jade')
  await frame(1300, 800)
  for (let i = 0; i < 8; i++) {
    await turn(app, '.armor-view', 45)
    await frame(300, 120)
  }
  await frame(1200)
}
