// Phase 6b, step 4: the metal interpretation switch. The fixture's gold_block is predefined gold
// (231): each mode (spec, 230–255 as 255, no albedo tint) must shade it differently.

async function view(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.test-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

async function mode(app, id) {
  await app.setValue('select[aria-label=Metalli]', id)
  await app.sleep(900)
  return view(app)
}

export default async function metals(app) {
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
  await app.ev(
    `document.querySelector('[aria-label="Luce degli effetti"] [data-lighting="${'noon'}"]').click()`
  )
  await app.sleep(1000)
  app.check(
    (await app.ev(`document.querySelector('select[aria-label=Metalli]').value`)) === 'spec',
    'metals start read like the spec'
  )

  const shots = new Set()
  for (const id of ['spec', 'albedo', 'untinted']) {
    shots.add(await mode(app, id))
    await app.shot(`01-gold-${id}`)
  }
  app.check(shots.size === 3, `each metal mode shades gold differently (${shots.size}/3)`)

  // In the F0 view a predefined metal shows its own color, an albedo metal the texture.
  const index = await app.ev(
    `[...document.querySelector('select[aria-label="Vista canale"]').options].findIndex((o) => o.textContent.startsWith('F0'))`
  )
  await app.setValue('select[aria-label="Vista canale"]', index)
  const f0Spec = await mode(app, 'spec')
  const f0Albedo = await mode(app, 'albedo')
  app.check(f0Spec !== f0Albedo, '"230–255 as 255" shows the albedo as F0')
  await app.shot('02-gold-f0-albedo-mode')
}
