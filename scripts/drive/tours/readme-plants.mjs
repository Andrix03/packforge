// README GIF "Plants" (see readme-kit.mjs): our own poppy drawn, then reshaped (bush, tall) and
// seen in the large 3D view. English, no captions.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'
import { recorder } from './readme-kit.mjs'

export const options = { language: 'en' }

const DIALOG = '[aria-label="Plant shape"]'

async function shape(app, label) {
  await app.click('Plant shape', '.editor button')
  await app.waitFor(`document.querySelector('[data-testid=shape-plan]')`, 10000)
  await app.click(label, `${DIALOG} [role=radio]`)
  await app.click('Apply the shape', `${DIALOG} button`)
  await app.waitFor(`document.querySelector('[data-testid=shape-result]')`, 10000)
  await app.click('Done', `${DIALOG} button`)
  await app.sleep(2000)
}

/** The large 3D view, scrolled so the plant is in the middle. */
async function large(app) {
  const small = await app.ev(
    `[...document.querySelectorAll('.editor button')].some((b) => b.textContent.includes('Small 3D'))`
  )
  if (!small) await app.click('Large 3D', '.editor button')
  await app.sleep(500)
  await app.ev(`document.querySelector('.preview-canvas').scrollIntoView({ block: 'center' })`)
}

export default async function tour(app) {
  const frame = recorder(app)
  const dir = join(app.paths.pack, 'assets', 'minecraft', 'textures', 'block')
  await mkdir(dir, { recursive: true })
  // A red flower on a green stem.
  await writeFile(
    join(dir, 'poppy.png'),
    png(16, 16, (x, y) => {
      if (y >= 8 && (x === 7 || (x === 8 && y === 11) || (x === 6 && y === 12)))
        return [50, 120 + y * 3, 40, 255]
      const d = (x - 7) ** 2 + (y - 5) ** 2
      if (d < 3) return [40, 20, 20, 255]
      if (d < 11) return [210 - d * 4, 30, 40, 255]
      return [0, 0, 0, 0]
    })
  )
  await app.openPack({ waitForVanilla: true })
  await app.section('blocks')
  await app.waitFor(
    `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('/poppy.png'))`
  )
  await app.openTexture('poppy.png')
  await app.waitFor(
    `[...document.querySelectorAll('.editor button')].some((b) => b.textContent.includes('Plant shape'))`,
    15000
  )
  await large(app)
  await frame(1400, 1500)
  await shape(app, 'Bush')
  await large(app)
  await frame(1600, 1500)
  await shape(app, 'Tall')
  await large(app)
  await frame(1600, 1500)
}
