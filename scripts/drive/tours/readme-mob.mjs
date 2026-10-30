// README GIF "Mobs" (see readme-kit.mjs): our own zombie texture on the 3D zombie, painted and
// turned. English, no captions.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'
import { recorder, turn } from './readme-kit.mjs'

export const options = { language: 'en' }

export default async function tour(app) {
  const frame = recorder(app)
  const dir = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'entity', 'zombie')
  await mkdir(dir, { recursive: true })
  const noise = (x, y) => (x * 7 + y * 13) % 9
  await writeFile(
    join(dir, 'zombie.png'),
    png(64, 64, (x, y) => {
      const n = noise(x, y)
      if (y < 16 && x < 32) return [80 + n, 130 + n, 60, 255] // head
      if (y >= 16 && y < 32 && x >= 16 && x < 40) return [30 + n, 100 + n, 110, 255] // shirt
      if (y >= 16 && y < 32 && x < 16) return [50 + n, 50 + n, 130, 255] // legs
      if (y >= 16 && y < 32 && x >= 40 && x < 56) return [80 + n, 130 + n, 60, 255] // arms
      return [0, 0, 0, 0]
    })
  )
  await app.openPack()
  await app.section('entities')
  await app.waitFor(
    `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('/zombie.png'))`
  )
  await app.openTexture('zombie.png')
  await app.waitFor(`document.querySelector('.mob-preview canvas')`, 10000)
  await frame(1200, 900)
  // Eyes and a mouth on the face (front of the head: x 8-15, y 8-15).
  await app.editor.setHex('#101010')
  for (const [x, y] of [
    [9, 11],
    [10, 11],
    [13, 11],
    [14, 11]
  ])
    await app.editor.click(x, y)
  await frame(500)
  await app.editor.setHex('#5a2020')
  await app.editor.draw([
    [10, 14],
    [13, 14]
  ])
  await frame(900)
  for (let i = 0; i < 8; i++) {
    await turn(app, '.mob-preview canvas', 45)
    await frame(300, 150)
  }
  await frame(1000)
}
