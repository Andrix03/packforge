// End to end: a diamond ore made from scratch (noisy stone + shaded gem clusters), relief from
// the colors, the ore preset on a new _s, saved and looked at in Prova.
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

const BLOCK = 'assets/minecraft/textures/block'
const num = (text) => Number(String(text).split(': ')[1])

// Gem clusters, shaded like vanilla: highlight, light, mid, dark edge.
const GEM = {
  ffffff: [[3, 3]],
  a1fbe8: [
    [4, 3],
    [3, 4],
    [11, 7],
    [6, 11]
  ],
  '4aedd9': [
    [4, 4],
    [5, 4],
    [10, 7],
    [11, 8],
    [7, 11],
    [6, 12]
  ],
  '1aa59c': [
    [4, 5],
    [5, 5],
    [10, 8],
    [7, 12],
    [12, 8]
  ]
}
const GEM_COUNT = Object.values(GEM).flat().length

async function testView(app) {
  const rect = await app.ev(`(() => {
    const r = document.querySelector('.test-canvas').getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })()`)
  return (await app.send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } }))
    .result.data
}

export default async function ore(app) {
  await app.openPack()

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
    set(name, 'diamond_ore')
  })()`)
  await app.setValue('[aria-label="Nuova texture"] input[type=color]', '#7f7f7f')
  await app.sleep(200)
  await app.click('Crea e apri', '[aria-label="Nuova texture"] button')
  await app.waitFor(
    `document.querySelector('.editor-canvas') && document.querySelector('.zoom-label')?.textContent.includes('%')`
  )
  await app.sleep(500)

  // Stone cracks (dark gray) and light specks: must stay stone.
  await app.editor.setHex('#5e5e5e')
  for (const p of [
    [0, 0],
    [8, 2],
    [9, 2],
    [14, 5],
    [1, 9],
    [13, 13],
    [14, 13]
  ])
    await app.editor.click(...p)
  await app.editor.setHex('#9a9a9a')
  for (const p of [
    [6, 1],
    [12, 3],
    [2, 14],
    [9, 14]
  ])
    await app.editor.click(...p)
  for (const [hex, points] of Object.entries(GEM)) {
    await app.editor.setHex(hex)
    for (const p of points) await app.editor.click(...p)
  }
  await app.sleep(300)
  await app.shot('01-albedo')

  await app.click('Rilievo _n', '.map-tabs [role=tab]')
  await app.waitFor(`document.querySelector('.generator-panel')`)
  await app.click('Genera tutto dai colori', '.generator-panel button')
  await app.sleep(400)

  await app.click('Materiale _s', '.map-tabs [role=tab]')
  await app.waitFor(`document.querySelector('.generator-panel[aria-label=Materiale]')`)
  await app.click('Minerale', '.material-presets button')
  await app.sleep(200)
  const count = await app.ev(`document.querySelector('[data-testid=accent-count]').textContent`)
  app.check(count === `Pixel gemma: ${GEM_COUNT}`, `every gem pixel and no stone found (${count})`)
  await app.click('Applica minerale', '.generator-panel button')
  await app.sleep(300)

  const at = async (x, y) => num(await app.editor.color(x, y))
  await app.click('Levigatezza', '.channel-tabs [role=tab]')
  await app.sleep(200)
  const gemSmooth = [await at(3, 3), await at(4, 4), await at(4, 5)]
  const stoneSmooth = [await at(7, 7), await at(0, 0), await at(6, 1)]
  app.check(
    gemSmooth.every((v) => v > 180),
    `gem pixels are smooth (${gemSmooth.join(', ')})`
  )
  app.check(
    stoneSmooth.every((v) => v < 90),
    `stone pixels are rough (${stoneSmooth.join(', ')})`
  )
  app.check(stoneSmooth[1] < stoneSmooth[0], 'cracks are rougher than the plain stone')
  await app.click('Riflettanza', '.channel-tabs [role=tab]')
  await app.sleep(200)
  app.check((await at(4, 5)) === 44 && (await at(7, 7)) === 10, 'F0: gem 44, stone 10')
  await app.click('Porosità', '.channel-tabs [role=tab]')
  await app.sleep(200)
  app.check((await at(4, 4)) === 0 && (await at(7, 7)) === 24, 'porosity: gem 0, stone 24')
  await app.click('Emissione', '.channel-tabs [role=tab]')
  await app.sleep(200)
  app.check((await at(3, 3)) === 0, 'the ore preset does not make anything glow')

  await app.key('s', ['ctrl'])
  await app.waitFor(
    `(() => { const t = document.querySelector('.editor-header').textContent; return t.includes('Salvata') && !t.includes('modificata') })()`
  )
  const s = await readFile(join(app.paths.pack, BLOCK, 'diamond_ore_s.png'))
  app.check(s.subarray(1, 4).toString() === 'PNG', 'diamond_ore_s.png saved')

  await app.click('Prova')
  await app.waitFor(
    `/\\d+ blocc/.test(document.querySelector('.test-side')?.textContent ?? '')`,
    15000
  )
  await app.sleep(1500)
  app.check(
    await app.ev(`document.querySelector('.test-side').textContent.includes('✓ _s')`),
    'Prova sees the _s map'
  )
  app.check(
    !(await app.ev(`document.querySelector('.test-screen .editor-header').textContent`)).includes(
      'non salvate'
    ),
    'after saving, Prova does not claim unsaved changes'
  )
  await app.setValue('input[aria-label=Distanza]', 2.2)
  await app.ev(
    `document.querySelector('[aria-label="Luce degli effetti"] [data-lighting="${'noon'}"]').click()`
  )
  await app.sleep(1800)
  const noon = await testView(app)
  await app.shot('02-prova-noon')
  await app.ev(
    `document.querySelector('[aria-label="Luce degli effetti"] [data-lighting="${'sunset'}"]').click()`
  )
  // Under load the new light can take a few frames: wait for the picture to change.
  let changed = false
  for (let i = 0; i < 12 && !changed; i++) {
    await app.sleep(500)
    changed = noon !== (await testView(app))
  }
  await app.shot('03-prova-sunset')
  app.check(changed, 'the light changes the ore')
}
