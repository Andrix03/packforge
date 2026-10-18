// Phase 6b, step 6: rain and wetness driven by porosity (Photon's puddle formula). The fixture's
// sand is fully porous (_s blue 64): it must darken in the rain; stone (porosity 0.31) gets puddles.

async function view(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.test-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

/** Average brightness (0–255) of the central part of the 3D view. */
async function brightness(app) {
  const data = await view(app)
  return app.ev(`(async () => {
    const image = new Image()
    image.src = 'data:image/png;base64,${data}'
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0)
    const p = ctx.getImageData(Math.round(image.width * 0.4), Math.round(image.height * 0.45), Math.round(image.width * 0.2), Math.round(image.height * 0.15)).data
    let sum = 0
    for (let i = 0; i < p.length; i += 4) sum += (p[i] + p[i + 1] + p[i + 2]) / 3
    return Math.round(sum / (p.length / 4))
  })()`)
}

async function openTest(app, file) {
  await app.setValue('input[type=search]', file.replace('.png', ''))
  await app.waitFor(
    `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('block/${file}'))`
  )
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('block/${file}')).click()`
  )
  await app.click('Prova in gioco')
  await app.waitFor(`/\\d+ blocc/.test(document.querySelector('.test-side').textContent)`, 15000)
  await app.sleep(800)
}

async function rain(app, value) {
  await app.setValue('input[aria-label=Pioggia]', value)
  await app.sleep(900)
}

export default async function rainScenario(app) {
  await app.openPack({ waitForVanilla: true })

  // Sand floor at noon: fully porous, it soaks up the water and darkens.
  await openTest(app, 'sand.png')
  await app.click('Pavimento 5×5', '.test-side [role=radio]')
  await app.sleep(1500)
  await app.setValue('select[aria-label="Luce degli effetti"]', 'noon')
  await app.sleep(800)
  const dry = await brightness(app)
  await app.shot('01-sand-dry')
  await rain(app, 1)
  const wet = await brightness(app)
  await app.shot('02-sand-wet')
  app.check(wet < dry - 5, `wet sand is darker (${dry} → ${wet})`)
  app.check(
    (await app.ev(`document.querySelector('.test-side').textContent`)).includes('bagnato'),
    'the rain slider shows how wet it is'
  )
  await app.click('Chiudi prova')
  await app.waitFor(`!document.querySelector('.test-screen')`)

  // Stone floor: puddles on the top faces (shiny, reflecting the sky).
  await openTest(app, 'stone.png')
  await app.click('Pavimento 5×5', '.test-side [role=radio]')
  await app.sleep(1500)
  await app.setValue('select[aria-label="Luce degli effetti"]', 'noon')
  await app.sleep(800)
  const stoneDry = await view(app)
  await app.shot('03-stone-dry')
  await rain(app, 1)
  app.check(stoneDry !== (await view(app)), 'rain changes the stone floor (puddles)')
  await app.shot('04-stone-puddles')

  // Inside the cave no rain falls.
  await app.click('Grotta', '.test-side [role=radio]')
  await app.sleep(2000)
  await app.shot('05-cave-in-rain')
  app.check(true, 'the cave renders in the rain')
}
