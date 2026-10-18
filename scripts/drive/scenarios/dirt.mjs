// End to end: a dirt block made from scratch with the Phase 8 tools (noise albedo + details,
// generated relief at the default depth, rough porous material), saved and looked at in Prova.
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const BLOCK = 'assets/minecraft/textures/block'

async function value(app, x, y) {
  return app.editor.color(x, y)
}
const num = (text) => Number(String(text).split(': ')[1])

async function testView(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.test-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

export default async function dirt(app) {
  await app.openPack()

  // 1. New texture: dirt, 16×16, noise from a brown base.
  await app.click('+ Nuova texture')
  await app.waitFor(`document.querySelector('[aria-label="Nuova texture"]')`)
  const inputs = `[aria-label="Nuova texture"] input:not([type=color])`
  await app.ev(`(() => {
    const [folder, name] = document.querySelectorAll('${inputs}')
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set(folder, '${BLOCK}')
    set(name, 'dirt')
  })()`)
  await app.setValue('[aria-label="Nuova texture"] input[type=color]', '#866043')
  await app.sleep(200)
  await app.shot('01-new-texture-dialog')
  await app.click('Crea e apri', '[aria-label="Nuova texture"] button')
  await app.waitFor(
    `document.querySelector('.editor-canvas') && document.querySelector('.zoom-label')?.textContent.includes('%')`
  )
  await app.sleep(500)
  app.check((await app.editor.header()).includes('dirt'), 'dirt.png created and opened')

  // 2. Hand details: dark clumps and light pebbles.
  await app.editor.setHex('#5a3b24')
  for (const [x, y] of [
    [2, 3],
    [3, 3],
    [9, 1],
    [12, 6],
    [13, 6],
    [5, 10],
    [6, 10],
    [6, 11],
    [14, 13],
    [1, 14]
  ])
    await app.editor.click(x, y)
  await app.editor.setHex('#a08670')
  for (const [x, y] of [
    [4, 6],
    [5, 6],
    [10, 9],
    [11, 9],
    [11, 10],
    [2, 12],
    [8, 14],
    [14, 2]
  ])
    await app.editor.click(x, y)
  await app.sleep(300)
  await app.shot('02-albedo')

  // 3. Relief: generate everything from the colors.
  await app.click('Rilievo _n', '.map-tabs [role=tab]')
  await app.waitFor(`document.querySelector('.generator-panel')`)
  await app.sleep(200)
  await app.click('Genera tutto dai colori', '.generator-panel button')
  await app.sleep(500)
  const pebble = num(await value(app, 4, 6))
  const clump = num(await value(app, 2, 3))
  app.check(pebble > clump, `pebbles stand higher than dark clumps (height ${pebble} vs ${clump})`)
  app.check(clump >= 1, 'no height below 1')
  await app.shot('03-height')
  await app.click('Normali', '.channel-tabs [role=tab]')
  await app.sleep(300)
  await app.shot('04-normals')
  await app.click('Occlusione', '.channel-tabs [role=tab]')
  await app.sleep(300)
  const aoClump = num(await value(app, 2, 3))
  const aoPebble = num(await value(app, 4, 6))
  app.check(
    aoClump < aoPebble,
    `clumps get more occlusion than pebbles (${aoClump} vs ${aoPebble})`
  )
  await app.shot('05-ao')

  // 4. Material: dirt rough and porous, pebbles a bit smoother and not porous.
  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.sleep(300)
  await app.click('Levigatezza', '.channel-tabs [role=tab]')
  await app.sleep(200)
  await app.setValue('input[aria-label="Valore primario"]', 25)
  await app.key('g')
  await app.editor.click(0, 0)
  await app.key('b')
  await app.setValue('input[aria-label="Valore primario"]', 110)
  for (const [x, y] of [
    [4, 6],
    [5, 6],
    [10, 9],
    [11, 9],
    [11, 10],
    [2, 12],
    [8, 14],
    [14, 2]
  ])
    await app.editor.click(x, y)
  await app.sleep(200)
  app.check(num(await value(app, 7, 7)) === 25, 'dirt smoothness 25')
  app.check(num(await value(app, 4, 6)) === 110, 'pebble smoothness 110')
  await app.click('Porosità / SSS', '.channel-tabs [role=tab]')
  await app.sleep(200)
  await app.setValue('input[aria-label="Valore primario"]', 45)
  await app.key('g')
  await app.editor.click(0, 0)
  await app.key('b')
  await app.setValue('input[aria-label="Valore primario"]', 0)
  for (const [x, y] of [
    [4, 6],
    [5, 6],
    [10, 9],
    [11, 9],
    [11, 10],
    [2, 12],
    [8, 14],
    [14, 2]
  ])
    await app.editor.click(x, y)
  await app.sleep(200)
  app.check(num(await value(app, 7, 7)) === 45, 'dirt porosity 45')
  await app.shot('06-porosity')

  // 5. Save: three files.
  await app.key('s', ['ctrl'])
  await app.waitFor(
    `(() => { const t = document.querySelector('.editor-header').textContent; return t.includes('Salvata') && !t.includes('modificata') })()`
  )
  const dir = join(app.paths.pack, ...BLOCK.split('/'))
  for (const name of ['dirt.png', 'dirt_n.png', 'dirt_s.png']) {
    const ok = await stat(join(dir, name)).then(
      (s) => s.size > 0,
      () => false
    )
    app.check(ok, `${name} saved`)
  }
  const sBytes = await readFile(join(dir, 'dirt_s.png'))
  app.check(sBytes.subarray(1, 4).toString() === 'PNG', 'dirt_s.png is a PNG')

  // 6. Prova: block at sunset with and without POM, rain, cave, a big floor.
  await app.click('Prova')
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  await app.sleep(1500)
  app.check(
    await app.ev(`document.querySelector('.test-side').textContent.includes('✓ _n')`),
    'Prova sees the _n map'
  )
  await app.setValue('select[aria-label="Luce degli effetti"]', 'sunset')
  await app.setValue('input[aria-label=Distanza]', 2.2)
  await app.sleep(1800)
  const withPom = await testView(app)
  await app.shot('07-prova-sunset')
  await app.setValue('input[aria-label="Rilievo POM"]', 0)
  await app.sleep(1200)
  const noPom = await testView(app)
  await app.shot('08-prova-sunset-no-pom')
  app.check(withPom !== noPom, 'POM changes the dirt')
  await app.setValue('input[aria-label="Rilievo POM"]', 1)
  await app.setValue('select[aria-label="Luce degli effetti"]', 'noon')
  await app.sleep(1500)
  await app.shot('09-prova-noon')
  await app.setValue('input[aria-label=Pioggia]', 1)
  await app.sleep(1800)
  await app.shot('10-prova-rain')
  await app.setValue('input[aria-label=Pioggia]', 0)
  await app.click('Pavimento', '.test-side [role=radio]').catch(() => {})
  await app.click('Distesa', '.test-side [role=radio]').catch(() => {})
  await app.sleep(2500)
  await app.setValue('input[aria-label=Distanza]', 5)
  await app.sleep(2000)
  await app.shot('11-prova-floor')
}
