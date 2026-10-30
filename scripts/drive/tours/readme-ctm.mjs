// README GIF "Connected textures" (see readme-kit.mjs): the fixture glass, its 47 tiles made in
// the app, then a wall of it in Test with the connection off and on. English, no captions.
import { press, recorder } from './readme-kit.mjs'

export const options = { language: 'en' }

const ctmSwitch = (app) =>
  app.ev(
    `[...document.querySelectorAll('.test-side label')].find((l) => l.textContent.startsWith('Connected textures')).querySelector('input').click()`
  )

export default async function tour(app) {
  const frame = recorder(app)
  await app.openPack()
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/glass.png')).click()`
  )
  await app.sleep(300)
  await app.tool('Connected textures')
  await app.waitFor(`document.querySelector('[aria-label="Connected textures"]')`)
  await frame(1300, 600)
  await press(app, 'Create the 47', '[aria-label="Connected textures"]')
  await app.waitFor(`document.querySelector('[data-testid=ctm-result]')`, 20000)
  await frame(1600, 600)
  await press(app, 'Close', '[aria-label="Connected textures"]')
  await app.sleep(800)

  await app.openTexture('glass.png')
  await app.click('Test', '.map-tabs button')
  await app.waitFor(
    `/\\d+ block/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  await app.click('Wall 3×3', '.test-side [role=radio]')
  await app.setValue('input[aria-label=Distance]', 8)
  await app.sleep(1800)
  await ctmSwitch(app)
  await frame(1400, 1800)
  await ctmSwitch(app)
  await frame(1800, 1800)
  await app.click('Floor 5×5', '.test-side [role=radio]')
  await frame(1800, 2000)
}
