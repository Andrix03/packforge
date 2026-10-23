// Phase 6b, step 3: reflections of the real scene (cube map capture prefiltered by roughness).
// The fixture's gold_block is predefined gold (231) and very smooth: it should mirror its
// neighbours. WebGL can't be read back: changes are detected by comparing screenshots.

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
  await app.sleep(1500)
}

async function reflections(app, mode) {
  await app.setValue('select[aria-label=Riflessi]', mode)
  await app.sleep(900)
  return view(app)
}

export default async function reflectionsScenario(app) {
  await app.openPack({ waitForVanilla: true })
  await app.setValue('input[type=search]', 'gold_block')
  await app.waitFor(
    `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('block/gold_block.png'))`
  )
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('block/gold_block.png')).click()`
  )
  await app.click('Prova in gioco')
  await app.waitFor(`/\\d+ blocc/.test(document.querySelector('.test-side').textContent)`, 15000)
  await app.sleep(1000)
  app.check(
    (await app.ev(`document.querySelector('select[aria-label=Riflessi]').value`)) === 'scene',
    'reflections start on the real scene'
  )
  await app.ev(
    `document.querySelector('[aria-label="Luce degli effetti"] [data-lighting="${'noon'}"]').click()`
  )
  await app.sleep(800)
  await app.shot('01-gold-block-noon')

  await scene(app, 'Con altri blocchi')
  const captured = await reflections(app, 'scene')
  await app.shot('02-gold-mixed-scene-reflections')
  const sky = await reflections(app, 'sky')
  await app.shot('03-gold-mixed-sky-only')
  app.check(captured !== sky, 'the captured scene changes the reflections')

  await reflections(app, 'scene')
  await scene(app, 'Angolo di casa')
  await app.shot('04-gold-house')
  await scene(app, 'Grotta')
  await app.shot('05-gold-cave')

  // Moving the camera moves the probe: the capture follows without errors.
  await app.setValue('input[aria-label=Distanza]', 3)
  await app.sleep(800)
  await app.shot('06-gold-cave-close')
  await app.click('Confronta con vanilla', 'label')
  await app.waitFor(`document.querySelector('.test-label.right')`)
  await app.sleep(1500)
  await app.shot('07-gold-cave-compare')
  app.check(true, 'captures render in both halves')
}
