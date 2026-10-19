// Phase 9 CTM preview in Prova: glass tiles generated in the app, then the 3×3 wall and the 5×5
// floor with "Texture connesse" on and off (more models and a different picture when on); a
// method the preview does not support is explained instead.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function testView(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.test-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

const status = (app) =>
  app.ev(
    `document.querySelector('.test-side').textContent.match(/\\d+ blocc\\w+ · \\d+ tip\\w/)?.[0] ?? ''`
  )
const types = (text) => Number(/· (\d+) tip/.exec(text)?.[1] ?? NaN)

async function ctmBox(app) {
  return app.ev(`(() => {
    const label = [...document.querySelectorAll('.test-side label')].find((l) => l.textContent.startsWith('Texture connesse'))
    return label ? { title: label.title, text: label.textContent, checked: label.querySelector('input').checked, disabled: label.querySelector('input').disabled } : null
  })()`)
}

async function toggleCtm(app) {
  await app.ev(
    `[...document.querySelectorAll('.test-side label')].find((l) => l.textContent.startsWith('Texture connesse')).querySelector('input').click()`
  )
  await app.sleep(1800)
}

async function openProva(app, texture) {
  await app.openTexture(texture)
  await app.click('Prova')
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  await app.sleep(1200)
}

async function scene(app, name) {
  await app.click(name, '.test-side [role=radio]')
  await app.sleep(1800)
}

export default async function ctmPreview(app) {
  // An overlay set for stone: the preview cannot show it.
  const overlay = join(app.paths.pack, 'assets', 'minecraft', 'optifine', 'ctm', 'stone_overlay')
  await mkdir(overlay, { recursive: true })
  await writeFile(join(overlay, 'stone.properties'), 'method=overlay\ntiles=0-16\n')

  await app.openPack()
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('/glass.png')).click()`
  )
  await app.sleep(300)
  await app.click('Texture connesse')
  await app.waitFor(`document.querySelector('[aria-label="Texture connesse"]')`)
  await app.sleep(400)
  await app.ev(
    `[...document.querySelectorAll('[aria-label="Texture connesse"] button')].find((b) => b.textContent.startsWith('Crea i 47')).click()`
  )
  await app.waitFor(`document.querySelector('[data-testid=ctm-result]')`, 20000)
  await app.click('Chiudi', '[aria-label="Texture connesse"] button')
  await app.sleep(1000)

  await openProva(app, 'glass.png')
  const box = await ctmBox(app)
  app.check(box?.checked && box.text.includes('(ctm)'), `Prova finds the glass CTM (${box?.text})`)
  app.check(box?.title.includes('47 tile'), `the .properties is read: 47 tiles (${box?.title})`)

  await scene(app, 'Muro 3×3')
  await app.setValue('input[aria-label=Distanza]', 4)
  await app.sleep(1500)
  const wallOn = await status(app)
  const wallOnShot = await testView(app)
  await app.shot('01-wall-ctm')
  await toggleCtm(app)
  const wallOff = await status(app)
  const wallOffShot = await testView(app)
  await app.shot('02-wall-plain')
  app.check(
    types(wallOn) > types(wallOff),
    `wall: tiles split the glass into several models (${wallOn} vs ${wallOff})`
  )
  app.check(wallOnShot !== wallOffShot, 'wall: connected glass looks different')
  await toggleCtm(app)

  await scene(app, 'Pavimento 5×5')
  await app.setValue('input[aria-label=Distanza]', 5)
  await app.sleep(1500)
  await app.shot('03-floor-ctm')
  const floor = await status(app)
  app.check(types(floor) >= 9, `floor: at least the 9 classic tiles (${floor})`)
  await app.click('Torna a disegnare')
  await app.sleep(500)
  await app.ev(`window.confirm = () => true`)
  await app.click('Chiudi editor')
  await app.sleep(500)

  await openProva(app, 'stone.png')
  const stoneBox = await ctmBox(app)
  app.check(
    stoneBox?.disabled && stoneBox.text.includes('non mostrabili'),
    `unsupported method explained (${stoneBox?.text})`
  )
}
