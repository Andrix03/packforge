// Phase 6b, step 1: game-like light levels and smooth-lighting AO in the test scenes.
// The cave tunnel is open on one side only: deep inside, sky light fades and a torch lights the end.
// Brightness is measured on the left wall: near the mouth vs halfway in (the far wall has the torch).

async function view(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.test-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

/** Average brightness (0–255) of a box of the 3D view, given as fractions of its size. */
async function brightness(app, box = [0.45, 0.45, 0.1, 0.1]) {
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
    const [fx, fy, fw, fh] = ${JSON.stringify(box)}
    const pixels = ctx.getImageData(
      Math.round(image.width * fx), Math.round(image.height * fy),
      Math.max(1, Math.round(image.width * fw)), Math.max(1, Math.round(image.height * fh))
    ).data
    let sum = 0
    for (let i = 0; i < pixels.length; i += 4) sum += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
    return Math.round(sum / (pixels.length / 4))
  })()`)
}

const statusText = `[...document.querySelectorAll('.test-side .muted.small')].map((e) => e.textContent).join(' | ')`

async function scene(app, label) {
  const before = await app.ev(statusText)
  await app.click(label, '.test-side [role=radio]')
  await app.waitFor(`(${statusText}) !== ${JSON.stringify(before)}`, 15000)
  await app.sleep(1200)
}

export default async function light(app) {
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
  await app.sleep(1000)

  // Vanilla look first.
  await app.click('Mostra effetti', 'label')
  await app.sleep(600)
  const lone = await brightness(app)
  await app.shot('01-block-vanilla')

  await scene(app, 'Grotta')
  const mouth = await brightness(app, [0.02, 0.4, 0.06, 0.2])
  const deep = await brightness(app, [0.3, 0.45, 0.04, 0.1])
  app.check(deep < mouth, `the cave gets darker inside (mouth ${mouth}, deep ${deep})`)
  app.check(
    deep < lone,
    `the inside of the cave is darker than a block in the open (${deep} < ${lone})`
  )
  await app.shot('02-cave-vanilla')

  await scene(app, 'Angolo di casa')
  await app.shot('03-house-vanilla-ao')
  await scene(app, 'Sentiero')
  await app.shot('04-path-vanilla-tree')

  // With the effects (PBR) the same light levels apply.
  await app.click('Mostra effetti', 'label')
  await app.sleep(800)
  await scene(app, 'Grotta')
  const pbrDeep = await brightness(app, [0.3, 0.45, 0.04, 0.1])
  const pbrMouth = await brightness(app, [0.02, 0.4, 0.06, 0.2])
  app.check(
    pbrDeep < pbrMouth,
    `with effects the cave is darker inside too (${pbrMouth} → ${pbrDeep})`
  )
  await app.shot('05-cave-effects')
  await scene(app, 'Angolo di casa')
  await app.shot('06-house-effects')
}
