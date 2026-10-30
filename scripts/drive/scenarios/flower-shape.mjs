// Plant shape on a flower (playtest 2026-10-29: only staged crops had it): a new poppy offers the
// shapes with the cross as vanilla and no stages to choose, bushy writes its model, and the tool
// is still there on the reshaped flower.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const BLOCK = 'assets/minecraft/textures/block'
const DIALOG = '[aria-label="Forma della pianta"]'

export default async function flowerShape(app) {
  await app.openPack()
  await app.click('+ Nuova texture')
  await app.waitFor(`document.querySelector('[aria-label="Nuova texture"]')`)
  await app.ev(`(() => {
    const [folder, name] = document.querySelectorAll('[aria-label="Nuova texture"] input:not([type=color])')
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set(folder, '${BLOCK}')
    set(name, 'poppy')
  })()`)
  await app.click('Vuota', '[aria-label="Nuova texture"] [role=radio]')
  await app.click('Crea e apri', '[aria-label="Nuova texture"] button')
  await app.waitFor(`document.querySelector('.editor-canvas')`)
  await app.editor.setHex('#d02020')
  await app.editor.draw([
    [7, 4],
    [7, 12]
  ])
  await app.key('s', ['ctrl'])
  await app.sleep(1000)

  const offered = () =>
    app.ev(
      `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Forma della pianta'))`
    )
  await app.waitFor(
    `[...document.querySelectorAll('button')].some((b) => b.textContent.includes('Forma della pianta'))`,
    15000
  )
  app.check(true, 'the flower offers Forma della pianta')
  await app.click('Forma della pianta')
  await app.waitFor(`document.querySelector('[data-testid=shape-plan]')`, 10000)
  const labels = await app.ev(
    `[...document.querySelectorAll('${DIALOG} [role=radio]')].map((b) => b.textContent.trim()).join(',')`
  )
  app.check(labels === 'Cancelletto,Vanilla,Cespuglio,Alta', `flower shapes: ${labels}`)
  app.check(
    !(await app.ev(`!!document.querySelector('${DIALOG} input[type=checkbox]')`)),
    'no stages to choose'
  )
  const plan = await app.ev(`document.querySelector('[data-testid=shape-plan]').textContent`)
  app.check(plan === 'Modelli: block/poppy', plan)
  await app.click('Cespuglio', `${DIALOG} [role=radio]`)
  await app.shot('flower-shape')
  await app.click('Applica la forma', `${DIALOG} button`)
  await app.waitFor(`document.querySelector('[data-testid=shape-result]')`, 10000)
  await app.click('Fatto', `${DIALOG} button`)
  const model = JSON.parse(
    await readFile(join(app.paths.pack, 'assets/minecraft/models/block/poppy.json'), 'utf8')
  )
  app.check(
    model.elements?.length === 6 && model.textures.crop === 'minecraft:block/poppy',
    `bushy poppy: ${model.elements?.length} planes`
  )
  await app.sleep(2000)
  app.check(await offered(), 'the reshaped flower still offers the tool')
}
