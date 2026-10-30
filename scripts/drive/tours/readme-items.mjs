// README GIF "Items" (see readme-kit.mjs): our own apple made 3D in hand, then seen in the
// inventory, in first and third person and on the ground. English, no captions.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'
import { press, recorder } from './readme-kit.mjs'

export const options = { language: 'en' }

export default async function tour(app) {
  const frame = recorder(app)
  const dir = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'item')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'apple.png'),
    png(16, 16, (x, y) => {
      if (x === 8 && y < 4) return [100, 60, 20, 255]
      if (x === 9 && y === 3) return [60, 150, 50, 255]
      const d = (x - 7.5) ** 2 + (y - 9) ** 2
      if (d >= 36) return [0, 0, 0, 0]
      return d < 6 && x < 7 ? [250, 120, 120, 255] : [200 - Math.round(d * 2), 30, 40, 255]
    })
  )
  await app.openPack({ waitForVanilla: true })
  await app.section('items')
  await app.waitFor(
    `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('/apple.png'))`
  )
  await app.openTexture('apple.png')
  await app.sleep(800)
  await press(app, '3D in hand', '.editor')
  await app.waitFor(`document.querySelector('[data-testid=item3d-plan]')`, 10000)
  await app.click('Thickness 2', '[role=dialog] button')
  await frame(1300, 500)
  await app.click('Create the 3D model', '[role=dialog] button')
  await app.waitFor(`document.querySelector('[data-testid=item3d-result]')`, 10000)
  await app.click('Done', '[role=dialog] button')
  await app.sleep(1500)
  for (const view of ['Inventory', 'Third person', 'On the ground', 'Item frame']) {
    await app.click(view, '.editor button')
    await frame(1100, 1000)
  }
}
