// Phase 7: parallax occlusion mapping from _n.a. The fixture's stone_n has grooves between its
// 8×8 tiles (height 140/255): POM must dig them in, self-shadow them, and the slope normals must
// change the step sides. WebGL can't be read back: changes are detected by comparing screenshots.

async function view(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.test-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

async function set(app, selector, value) {
  await app.setValue(selector, value)
  await app.sleep(900)
  return view(app)
}

async function toggle(app, label) {
  await app.click(label, 'label')
  await app.sleep(900)
  return view(app)
}

export default async function pom(app) {
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
  await app.ev(
    `document.querySelector('[aria-label="Luce degli effetti"] [data-lighting="${'sunset'}"]').click()`
  )
  await app.setValue('input[aria-label=Distanza]', 2.5)
  await app.sleep(1200)
  app.check(
    (await app.ev(`document.querySelector('input[aria-label="Rilievo POM"]').value`)) === '1',
    'POM starts on at the spec depth (100% = 25% of a block)'
  )

  const on = await view(app)
  await app.shot('01-pom-on-sunset')
  const off = await set(app, 'input[aria-label="Rilievo POM"]', 0)
  await app.shot('02-pom-off')
  app.check(on !== off, 'POM changes the stone (grooves dug in)')
  await set(app, 'input[aria-label="Rilievo POM"]', 2)
  await app.shot('03-pom-200')
  await set(app, 'input[aria-label="Rilievo POM"]', 1)

  const noShadow = await toggle(app, 'Ombre del rilievo')
  await app.shot('04-pom-no-self-shadow')
  app.check(noShadow !== on, 'self-shadowing changes the relief')
  await toggle(app, 'Ombre del rilievo')

  const slopes = await toggle(app, 'Lati dei pixel')
  await app.shot('05-pom-slope-normals')
  app.check(slopes !== on, 'slope normals change the step sides')
  await toggle(app, 'Lati dei pixel')

  const few = await set(app, 'input[aria-label="Passi POM"]', 8)
  await app.shot('06-pom-8-steps')
  app.check(few !== on, 'fewer steps change the relief')
  await set(app, 'input[aria-label="Passi POM"]', 40)

  // Side by side with and without POM, on a wall.
  await app.click('Muro 3×3', '.test-side [role=radio]')
  await app.sleep(1500)
  await app.click('Confronta con e senza POM', 'label')
  await app.waitFor(`document.querySelector('.test-label.right')?.textContent === 'Senza POM'`)
  await app.sleep(1500)
  app.check(
    await app.ev(`document.querySelector('.test-label.left').textContent === 'Con POM'`),
    'the comparison labels both halves'
  )
  await app.shot('07-wall-with-without-pom')
}
