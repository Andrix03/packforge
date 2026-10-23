// Records the README animation (English interface): open a pack, paint an ore into stone, give it
// relief, look at it under a few lights, test it in a wall and a cave. Writes NNN-<ms>.png frames
// to DEMO_FRAMES; scripts/make-demo-gif.mjs turns them into .github/assets/demo.gif.
//   DEMO_FRAMES=<dir> npm run drive -- scripts/drive/tours/readme.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const options = { language: 'en' }

const OUT = process.env['DEMO_FRAMES']
let n = 0

async function frame(app, ms) {
  const shot = await app.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(
    join(OUT, `${String(n++).padStart(3, '0')}-${ms}.png`),
    Buffer.from(shot.result.data, 'base64')
  )
}

export default async function readme(app) {
  if (!OUT) throw new Error('set DEMO_FRAMES')
  mkdirSync(OUT, { recursive: true })
  await app.waitFor(`document.querySelector('.shell-hotbar')`)
  await app.sleep(600)
  await frame(app, 1400)

  await app.openPack()
  await app.sleep(600)
  await frame(app, 1100)

  await app.openTexture('stone.png')
  await app.sleep(900)
  await frame(app, 900)

  // An ore: a few gold clusters, a frame every couple of pixels so the 3D follows.
  await app.editor.setHex('#f2c94c')
  await app.waitFor(`document.querySelector('.color-fields input')?.value === '#f2c94c'`)
  await app.sleep(400)
  const spots = [
    [3, 3],
    [4, 3],
    [3, 4],
    [11, 5],
    [12, 5],
    [12, 6],
    [6, 10],
    [7, 10],
    [7, 11],
    [6, 11],
    [12, 12],
    [13, 12],
    [2, 13]
  ]
  for (let i = 0; i < spots.length; i++) {
    await app.editor.click(...spots[i])
    if (i % 2 === 1) {
      await app.sleep(120)
      await frame(app, 160)
    }
  }
  await app.editor.setHex('#9a6b12')
  await app.sleep(400)
  for (const [x, y] of [
    [4, 4],
    [12, 7],
    [7, 12]
  ])
    await app.editor.click(x, y)
  await app.sleep(300)
  await frame(app, 1000)

  // Effects: relief from the colours, then three lights.
  await app.click('Effects', '.shell-tab')
  await app.waitFor(`document.querySelector('.shell-tab.active')?.dataset.workspace === 'effetti'`)
  await app.sleep(700)
  await frame(app, 700)
  await app.click('Generate all from the colours')
  await app.sleep(1200)
  await frame(app, 1100)
  for (const light of ['sunset', 'cave', 'nether']) {
    await app.ev(`document.querySelector('[data-lighting="${light}"]').click()`)
    await app.sleep(900)
    await frame(app, 1000)
  }
  await app.ev(`document.querySelector('[data-lighting="noon"]').click()`)

  // Test: a wall, then the cave.
  await app.click('Paint', '.shell-tab')
  await app.key('s', ['ctrl'])
  await app.sleep(600)
  await app.click('Test', '.editor-header button')
  await app.waitFor(`document.querySelector('.test-screen')`)
  await app.sleep(1500)
  await frame(app, 900)
  await app.click('Wall 3×3', '.test-side [role=radio]')
  await app.sleep(1500)
  await frame(app, 1300)
  await app.click('Cave', '.test-side [role=radio]')
  await app.sleep(2000)
  await frame(app, 1800)
  app.check(n > 10, `${n} frames recorded`)
}
