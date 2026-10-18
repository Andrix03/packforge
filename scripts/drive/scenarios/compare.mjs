// Phase 8 compare with vanilla: stats and the three views for stone (fixture pattern ≠ vanilla),
// a 32× oak_planks against the 16× game texture, the wipe view, unsaved edits included, no button
// for a texture the game does not have.
const stats = (app) =>
  app.ev(
    `[...document.querySelectorAll('[data-testid=compare-stats] li')].map((li) => li.textContent)`
  )

async function openCompare(app) {
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Confronta con vanilla'))`,
    10000
  )
  await app.click('Confronta con vanilla')
  await app.waitFor(`document.querySelector('[data-testid=compare-stats]')`)
  await app.sleep(300)
}

const newColorsOf = (lines) =>
  Number(/di cui (\d+) nuovi/.exec(lines.find((l) => l.startsWith('Colori')) ?? '')?.[1] ?? NaN)
const changedOf = (lines) => Number(/Pixel cambiati: (\d+)/.exec(lines[0] ?? '')?.[1] ?? NaN)

export default async function compare(app) {
  await app.openPack()

  await app.openTexture('stone.png')
  await openCompare(app)
  const stone = await stats(app)
  await app.shot('01-stone-side')
  app.check(
    (await app.ev(`document.querySelectorAll('.compare-canvas').length`)) === 3,
    'side view: mine, vanilla, differences'
  )
  app.check(changedOf(stone) > 128, `the fixture stone differs from vanilla (${stone[0]})`)
  app.check(
    stone.some((l) => l.includes('stessa dimensione (16×16)')),
    'same size reported'
  )
  const before = newColorsOf(stone)

  await app.click('Tendina', '.compare [role=radio]')
  await app.sleep(200)
  app.check(
    (await app.ev(`document.querySelectorAll('.compare-canvas.big').length`)) === 1,
    'wipe view: one big canvas'
  )
  await app.setValue('.compare input[aria-label=Tendina]', 0)
  await app.sleep(150)
  await app.shot('02-stone-wipe-vanilla')
  await app.click('Chiudi', '.compare button')
  await app.sleep(200)

  // Unsaved edits count: paint a whole row of a far-off color, compare again.
  await app.editor.setHex('ff00ff')
  await app.editor.draw([
    [0, 15],
    [15, 15]
  ])
  await app.sleep(200)
  await openCompare(app)
  const after = newColorsOf(await stats(app))
  app.check(
    after === before + 1,
    `unsaved edits are compared: one new color (${before} → ${after})`
  )
  await app.click('Chiudi', '.compare button')
  await app.ev(`window.confirm = () => true`)
  await app.click('Chiudi editor')
  await app.sleep(500)

  // 32× pack texture against the 16× game one.
  await app.openTexture('oak_planks.png')
  await openCompare(app)
  const planks = await stats(app)
  app.check(
    planks.some((l) => l.includes('32×32 contro 16×16 (×2)')),
    `resolution ratio shown (${planks.find((l) => l.startsWith('Dimensione'))})`
  )
  app.check(
    (await app.ev(`document.querySelector('.compare-canvas').width`)) === 32,
    'compared on the 32× grid'
  )
  await app.shot('03-planks')
  await app.click('Chiudi', '.compare button')
  await app.click('Chiudi editor')
  await app.sleep(500)

  // No vanilla texture with this path: no button.
  await app.openTexture('big.png')
  await app.sleep(1500)
  app.check(
    !(await app.ev(
      `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Confronta con vanilla'))`
    )),
    'no compare button without a vanilla texture'
  )
}
