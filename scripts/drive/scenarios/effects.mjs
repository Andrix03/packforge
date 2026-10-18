// Phase 6: LabPBR effects on the test screen. The fixture's stone has `_n` + `_s`, gold_block a
// predefined gold `_s`, glowstone an emissive `_s`. WebGL can't be read back: changes are
// detected by comparing screenshots of the 3D view; shader compile errors fail the run (console).

async function view(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.test-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

/** Average RGB of the central part of the 3D view (decoded in the page). */
async function centerColor(app) {
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
    const w = Math.round(image.width * 0.1), h = Math.round(image.height * 0.1)
    const pixels = ctx.getImageData(Math.round(image.width / 2 - w / 2), Math.round(image.height / 2 - h / 2), w, h).data
    const sum = [0, 0, 0]
    for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += pixels[i + c]
    return sum.map((s) => Math.round(s / (pixels.length / 4)))
  })()`)
}

const mapsText = `document.querySelector('[aria-label="Mappe LabPBR"]')?.textContent ?? ''`
const warnings = `[...document.querySelectorAll('.test-side .warning-text')].map((e) => e.textContent).join(' | ')`

/** Opens the test screen from the pack grid on a block texture. */
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
  await app.sleep(1200)
}

async function setView(app, label) {
  const index = await app.ev(
    `[...document.querySelector('select[aria-label="Vista canale"]').options].findIndex((o) => o.textContent.startsWith(${JSON.stringify(label)}))`
  )
  await app.setValue('select[aria-label="Vista canale"]', index)
  await app.sleep(600)
}

export default async function effects(app) {
  await app.openPack({ waitForVanilla: true })

  // ---- Stone: both maps found, effects on by default.
  await openTest(app, 'stone.png')
  const maps = await app.ev(mapsText)
  app.check(maps.includes('✓ _n') && maps.includes('✓ _s'), `stone has both maps (${maps})`)
  app.check(
    await app.ev(`document.querySelector('.test-side input[type=checkbox]:checked') !== null`),
    'effects start on when the texture has maps'
  )
  app.check(!(await app.ev(warnings)), `no warnings (${await app.ev(warnings)})`)
  await app.setValue('select[aria-label="Luce degli effetti"]', 'sunset')
  await app.sleep(800)
  const pbr = await view(app)
  await app.shot('01-stone-sunset')
  await app.click('Mostra effetti', 'label')
  await app.sleep(800)
  app.check(pbr !== (await view(app)), 'turning the effects off changes the view')
  await app.shot('02-stone-vanilla-look')
  await app.click('Mostra effetti', 'label')
  await app.sleep(800)

  // ---- Every channel view renders (no shader errors) and differs from the final image.
  const final = await view(app)
  const views = [
    'Albedo',
    'Normali',
    'AO',
    'Altezza',
    'Levigatezza',
    'F0',
    'Porosità',
    'Subsurface',
    'Emissione',
    'Solo luce'
  ]
  for (const [i, label] of views.entries()) {
    await setView(app, label)
    const shot = await view(app)
    app.check(shot !== final, `view "${label}" differs from the final image`)
    await app.shot(`03-view-${String(i + 1).padStart(2, '0')}-${label.toLowerCase()}`)
  }
  await setView(app, 'Normali')
  const normals = await centerColor(app)
  app.check(
    normals[2] > normals[0] && normals[2] > normals[1],
    `normals view is mostly blue (flat) at the center (${normals})`
  )
  await setView(app, 'Finale')

  // ---- Presets, exposure, tone mapping.
  const shots = new Set()
  for (const preset of ['noon', 'sunset', 'cave', 'nether']) {
    await app.setValue('select[aria-label="Luce degli effetti"]', preset)
    await app.sleep(700)
    shots.add(await view(app))
    await app.shot(`04-preset-${preset}`)
  }
  app.check(shots.size === 4, `each lighting preset looks different (${shots.size}/4)`)
  app.check(
    await app.ev(`document.querySelector('input[aria-label="Ora del giorno"]').disabled`),
    'the hour slider is off while a fixed preset is used'
  )
  await app.setValue('select[aria-label="Luce degli effetti"]', 'noon')
  await app.sleep(600)
  const normal = await centerColor(app)
  await app.setValue('input[aria-label=Esposizione]', 1.5)
  await app.sleep(600)
  const bright = await centerColor(app)
  app.check(
    bright[0] + bright[1] + bright[2] > normal[0] + normal[1] + normal[2],
    `more exposure is brighter (${normal} → ${bright})`
  )
  await app.setValue('select[aria-label="Tone mapping"]', 'aces')
  await app.sleep(600)
  await app.shot('05-noon-exposure-aces')
  await app.click('Ripristina effetti')
  await app.sleep(400)
  app.check(
    (await app.ev(`document.querySelector('input[aria-label=Esposizione]').value`)) === '0',
    'reset puts the exposure back to 0'
  )
  await app.click('Chiudi prova')
  await app.waitFor(`!document.querySelector('.test-screen')`)

  // ---- Gold: predefined metal 231 shows its own color in the F0 view.
  await openTest(app, 'gold_block.png')
  const goldMaps = await app.ev(mapsText)
  app.check(
    goldMaps.includes('✗ _n') && goldMaps.includes('✓ _s'),
    `gold has only _s (${goldMaps})`
  )
  await app.setValue('select[aria-label="Luce degli effetti"]', 'noon')
  await app.sleep(800)
  await app.shot('06-gold-noon')
  await setView(app, 'F0')
  const f0 = await centerColor(app)
  app.check(f0[0] > f0[2] + 40, `gold's F0 is warm, not gray (${f0})`)
  await app.shot('07-gold-f0')
  await app.click('Chiudi prova')
  await app.waitFor(`!document.querySelector('.test-screen')`)

  // ---- Glowstone in the cave: emission and bloom.
  await openTest(app, 'glowstone.png')
  await app.setValue('select[aria-label="Luce degli effetti"]', 'cave')
  await app.sleep(800)
  const glow = await view(app)
  await app.shot('08-glowstone-cave-bloom')
  await app.setValue('input[aria-label=Bloom]', 0)
  await app.sleep(600)
  app.check(glow !== (await view(app)), 'bloom changes the emissive block')
  await app.shot('09-glowstone-cave-no-bloom')
  await app.setValue('input[aria-label="Forza emissione"]', 0)
  await app.sleep(600)
  await app.shot('10-glowstone-no-emission')

  // ---- Side by side with vanilla while the effects are on.
  await app.setValue('input[aria-label=Bloom]', 1)
  await app.setValue('input[aria-label="Forza emissione"]', 8)
  await app.click('Confronta con vanilla', 'label')
  await app.waitFor(`document.querySelector('.test-label.right')`)
  await app.sleep(1500)
  await app.shot('11-glowstone-compare')
  app.check(true, 'comparison renders with the effects on')
}
