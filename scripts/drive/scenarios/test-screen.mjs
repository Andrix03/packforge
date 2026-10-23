// Phase 5: the test screen. Opened from the editor (unsaved work kept) and from the pack grid;
// scenes, distance + mipmaps, vanilla comparison, free fly, item views.
// WebGL can't be read back: changes are detected by comparing screenshots of the 3D view.

/** Base64 PNG of the 3D view of the test screen. */
async function view(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.test-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

const statusText = `[...document.querySelectorAll('.test-side .muted.small')].map((e) => e.textContent).join(' | ')`
const warnings = `[...document.querySelectorAll('.test-side .warning-text')].map((e) => e.textContent).join(' | ')`

/** Selects a scene and waits for its world to load (block count in the status). */
async function scene(app, label, minBlocks) {
  const before = await app.ev(statusText)
  await app.click(label, '.test-side [role=radio]')
  await app.waitFor(`(${statusText}) !== ${JSON.stringify(before)} || ${minBlocks} === 1`, 15000)
  // The scene's hint changes at once: wait for its world (the block count) too.
  await app
    .waitFor(`Number(/(\\d+) blocc/.exec(${statusText})?.[1] ?? 0) >= ${minBlocks}`, 15000)
    .catch(() => {})
  await app.sleep(900)
  const status = await app.ev(statusText)
  const count = Number(/(\d+) blocc/.exec(status)?.[1] ?? 0)
  app.check(count >= minBlocks, `scene "${label}": ${count} blocks (${status.split(' | ').at(-1)})`)
  return count
}

export default async function testScreen(app) {
  await app.openPack({ waitForVanilla: true })

  // ---- From the editor, with an unsaved change.
  await app.openTexture('stone.png')
  await app.key('b')
  await app.editor.setHex('ff2020')
  await app.editor.click(3, 3)
  await app.click('Prova')
  await app.waitFor(`document.querySelector('.test-screen')`)
  app.check(
    await app.ev(`document.querySelector('.editor').offsetParent === null`),
    'the editor is hidden under the test screen'
  )
  app.check(
    await app.ev(
      `document.querySelector('.test-screen header').textContent.includes('non salvate')`
    ),
    'the test uses the unsaved texture'
  )
  await app.waitFor(`/\\d+ blocc/.test(${statusText})`, 15000)
  app.check(
    (await app.ev(statusText)).includes('1 blocco'),
    `the single block scene loads (${await app.ev(statusText)})`
  )
  app.check(!(await app.ev(warnings)), `no warnings for stone (${await app.ev(warnings)})`)
  await app.sleep(800)
  await app.shot('01-block')

  // Editor shortcuts are off while testing: "e" (eraser) must not change the editor's tool.
  await app.key('e')

  // ---- Every scene.
  await scene(app, 'Muro 3×3', 9)
  await scene(app, 'Pavimento 5×5', 25)
  await scene(app, 'Con altri blocchi', 100)
  await app.shot('02-mixed')
  await app.setValue('.test-neighbours input', 'sand')
  await app.sleep(1500)
  app.check(
    !(await app.ev(
      `document.querySelector('.test-neighbours input').getAttribute('aria-invalid') === 'true'`
    )),
    'a neighbour can be changed (sand)'
  )
  await app.shot('03-mixed-sand')
  await scene(app, 'Angolo di casa', 150)
  await app.shot('04-house')
  await scene(app, 'Grotta', 300)
  await app.shot('05-cave')
  await scene(app, 'Sentiero', 150)
  await app.shot('06-path')

  // ---- Distance and mipmaps, on the big field.
  await scene(app, 'Distesa 33×33', 1000)
  const near = await view(app)
  await app.setValue('input[aria-label=Distanza]', 70)
  await app.sleep(800)
  const far = await view(app)
  app.check(near !== far, 'moving away changes the view')
  await app.shot('07-field-far-mipmaps')
  await app.click('Mipmap come nel gioco', 'label')
  await app.sleep(800)
  const sharp = await view(app)
  app.check(sharp !== far, 'mipmaps change how the far field looks')
  await app.shot('08-field-far-no-mipmaps')
  await app.click('Mipmap come nel gioco', 'label')

  // ---- Side-by-side with vanilla.
  await scene(app, 'Blocco', 1)
  await app.click('Confronta con vanilla', 'label')
  await app.waitFor(`document.querySelector('.test-label.right')`)
  await app.sleep(1500)
  app.check(
    await app.ev(`document.querySelector('.test-label.left').textContent === 'Il tuo pack'`),
    'the comparison labels both halves'
  )
  app.check(!(await app.ev(warnings)), `vanilla has the block (${await app.ev(warnings)})`)
  await app.shot('09-compare')
  await scene(app, 'Angolo di casa', 150)
  await app.shot('10-compare-house')
  await app.click('Confronta con vanilla', 'label')

  // ---- Free fly: holding W moves forward.
  await app.click('Volo libero')
  await app.sleep(300)
  const before = await view(app)
  await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW' })
  await app.sleep(700)
  await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW' })
  await app.sleep(200)
  app.check(before !== (await view(app)), 'W flies forward')
  await app.shot('11-fly')
  await app.click('Torna a ruotare')

  // ---- Back to drawing: same texture, unsaved work and tool still there.
  await app.click('Torna a disegnare')
  await app.waitFor(`!document.querySelector('.test-screen')`)
  app.check(
    await app.ev(`document.querySelector('.editor').offsetParent !== null`),
    'back in the editor'
  )
  app.check(
    await app.ev(`document.querySelector('.editor-header').textContent.includes('modificata')`),
    'the unsaved change is still there'
  )
  const red = await app.editor.color(3, 3)
  app.check(red === '#ff2020', `the painted pixel is still red (${red})`)
  app.check(
    !/gomma/i.test(await app.ev(`document.querySelector('.tool.active')?.textContent ?? ''`)),
    'the test screen keys did not reach the editor'
  )

  // ---- From the pack grid, an item texture.
  await app.answerDialogs(true)
  await app.click('Chiudi editor')
  await app.setValue('input[type=search]', 'diamond')
  await app.waitFor(
    `[...document.querySelectorAll('.texture-tile')].some((t) => t.title.endsWith('item/diamond.png'))`
  )
  await app.ev(
    `[...document.querySelectorAll('.texture-tile')].find((t) => t.title.endsWith('item/diamond.png')).click()`
  )
  await app.click('Prova in gioco')
  await app.waitFor(`document.querySelector('.test-screen .item-slots-canvas')`)
  await app.sleep(2000)
  app.check(
    await app.ev(
      `[...document.querySelectorAll('.test-side [role=radio]')].map((b) => b.textContent).join() === 'In mano'`
    ),
    'items have the "in hand" scene'
  )
  const slots = await app.ev(`document.querySelector('.item-slots-canvas').width`)
  app.check(slots > 0, `the inventory slots are drawn (${slots}px)`)
  await app.shot('12-item-hand')
  await app.click('Confronta con vanilla', 'label')
  await app.sleep(1500)
  await app.shot('13-item-compare')
  await app.click('Chiudi prova')
  await app.waitFor(
    `!document.querySelector('.test-screen') && document.querySelector('.texture-tile')`
  )
  app.check(true, 'closing the test returns to the pack')

  // "Back to drawing" from the pack opens the editor.
  await app.click('Prova in gioco')
  await app.waitFor(`document.querySelector('.test-screen')`)
  await app.click('Torna a disegnare')
  await app.waitFor(`document.querySelector('.editor-canvas')`)
  app.check(
    await app.ev(`document.querySelector('.editor-header').textContent.includes('diamond')`),
    '"back to drawing" from the pack opens the editor on the item'
  )
}
