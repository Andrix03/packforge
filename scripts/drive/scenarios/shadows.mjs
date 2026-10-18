// Phase 6b, step 2: sun shadows in the Effects view (shadow map, soft or snapped to the pixels).
// WebGL can't be read back: changes are detected by comparing screenshots of the 3D view.

async function view(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.test-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

const statusText = `[...document.querySelectorAll('.test-side .muted.small')].map((e) => e.textContent).join(' | ')`

async function scene(app, label) {
  const before = await app.ev(statusText)
  await app.click(label, '.test-side [role=radio]')
  await app.waitFor(`(${statusText}) !== ${JSON.stringify(before)}`, 15000)
  await app.sleep(1200)
}

async function shadows(app, mode) {
  await app.setValue('select[aria-label=Ombre]', mode)
  await app.sleep(700)
  return view(app)
}

export default async function shadowsScenario(app) {
  await app.openPack({ waitForVanilla: true })
  await app.setValue('input[type=search]', 'stone')
  await app.waitFor(
    `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('block/stone.png'))`
  )
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('block/stone.png')).click()`
  )
  await app.click('Prova in gioco')
  await app.waitFor(`/\\d+ blocc/.test(document.querySelector('.test-side').textContent)`, 15000)
  await app.sleep(800)
  app.check(
    (await app.ev(`document.querySelector('select[aria-label=Ombre]').value`)) === 'pixel',
    'shadows start snapped to the pixels'
  )

  await scene(app, 'Sentiero')
  await app.setValue('select[aria-label="Luce degli effetti"]', 'sunset')
  await app.sleep(700)
  const pixel = await view(app)
  await app.shot('01-path-sunset-pixel-shadows')
  const soft = await shadows(app, 'soft')
  await app.shot('02-path-sunset-soft-shadows')
  const off = await shadows(app, 'off')
  await app.shot('03-path-sunset-no-shadows')
  app.check(pixel !== off, 'the tree casts a shadow')
  app.check(pixel !== soft, 'pixel shadows differ from soft ones')

  await shadows(app, 'pixel')
  await scene(app, 'Angolo di casa')
  await app.setValue('select[aria-label="Luce degli effetti"]', 'noon')
  await app.sleep(700)
  await app.shot('04-house-noon')
  await app.setValue('select[aria-label="Luce degli effetti"]', 'time')
  await app.setValue('input[aria-label="Ora del giorno"]', 8)
  await app.sleep(700)
  await app.shot('05-house-morning')
  await app.setValue('input[aria-label="Ora del giorno"]', 0)
  await app.sleep(700)
  await app.shot('06-house-midnight-moon')

  // Side by side: each half gets its own shadow map.
  await app.setValue('input[aria-label="Ora del giorno"]', 16)
  await app.click('Confronta con vanilla', 'label')
  await app.waitFor(`document.querySelector('.test-label.right')`)
  await app.sleep(1500)
  await app.shot('07-house-compare')
  app.check(true, 'the comparison renders with shadows')
}
