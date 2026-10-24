// 1.2 "2D in the inventory, 3D in hand": on an item texture the button writes the extruded model
// (`models/item/<name>_3d.json`) and the item definition (`items/<name>.json`) that keeps the flat
// sprite in the GUI, on the ground and in frames. Items that change with their state (the bow)
// are refused. The fixture pack targets 1.21.4: no `on_shelf` context.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const ITEM = ['assets', 'minecraft', 'textures', 'item']

async function openFolder(app, path) {
  const parts = path.split('/')
  for (let i = 3; i <= parts.length; i++) {
    const folder = parts.slice(0, i).join('/')
    await app.waitFor(
      `[...document.querySelectorAll('button')].some((b) => b.title === '${folder}')`
    )
    await app.ev(`(() => {
      const button = [...document.querySelectorAll('button')].find((b) => b.title === '${folder}')
      if (button.getAttribute('aria-expanded') !== 'true') button.click()
    })()`)
    await app.sleep(150)
  }
}

export default async function item3d(app) {
  const dir = join(app.paths.pack, ...ITEM)
  await mkdir(dir, { recursive: true })
  // Our own apple: a red disc with a brown stem.
  await writeFile(
    join(dir, 'apple.png'),
    png(16, 16, (x, y) => {
      if (x === 8 && y < 4) return [100, 60, 20, 255]
      const d = (x - 7.5) ** 2 + (y - 9) ** 2
      return d < 36 ? [200, 30, 40, 255] : [0, 0, 0, 0]
    })
  )
  await writeFile(
    join(dir, 'bow.png'),
    png(16, 16, (x, y) => (x === y ? [120, 80, 40, 255] : [0, 0, 0, 0]))
  )

  await app.openPack({ waitForVanilla: true })
  await openFolder(app, ITEM.join('/'))
  await app.openTexture('apple.png')
  await app.click('3D in mano', '.editor button')
  await app.waitFor(`document.querySelector('[data-testid=item3d-plan]')`, 10000)
  const plan = await app.ev(`document.querySelector('[data-testid=item3d-plan]').textContent`)
  app.check(/\d+ elementi, \d+ facce/.test(plan), `the plan counts elements and faces (${plan})`)
  await app.click('Spessore 2', '[role=dialog] button')
  await app.shot('item3d-dialog')
  await app.click('Crea il modello 3D', '[role=dialog] button')
  await app.waitFor(`document.querySelector('[data-testid=item3d-result]')`, 10000)
  app.check(
    (await app.ev(`document.querySelector('[data-testid=item3d-result]').textContent`)).startsWith(
      '2 file scritti'
    ),
    'two files written'
  )

  const model = JSON.parse(
    await readFile(
      join(app.paths.pack, 'assets', 'minecraft', 'models', 'item', 'apple_3d.json'),
      'utf8'
    )
  )
  app.check(
    model.textures.texture === 'minecraft:item/apple' &&
      model.elements.every((e) => e.from[2] === 7 && e.to[2] === 9),
    'the 3D model draws the apple texture, 2 units thick'
  )
  const definition = JSON.parse(
    await readFile(join(app.paths.pack, 'assets', 'minecraft', 'items', 'apple.json'), 'utf8')
  )
  app.check(
    JSON.stringify(definition.model.cases[0].when) === JSON.stringify(['gui', 'ground', 'fixed']) &&
      definition.model.cases[0].model.model === 'minecraft:item/apple' &&
      definition.model.fallback.model === 'minecraft:item/apple_3d',
    `flat in the GUI, ground and frames, 3D elsewhere (${JSON.stringify(definition.model.cases[0].when)})`
  )
  await app.click('Fatto', '[role=dialog] button')
  await app.waitFor(`!document.querySelector('[role=dialog]')`)

  // Opening it again: already done.
  await app.click('3D in mano', '.editor button')
  await app.waitFor(`document.querySelector('[data-testid=item3d-problem]')`, 10000)
  app.check(
    (await app.ev(`document.querySelector('[data-testid=item3d-problem]').textContent`)).includes(
      'già 3D'
    ),
    'a second time it says the item is already 3D'
  )
  await app.key('Escape')

  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
  await app.openTexture('bow.png')
  await app.click('3D in mano', '.editor button')
  await app.waitFor(`document.querySelector('[data-testid=item3d-problem]')`, 10000)
  app.check(
    (await app.ev(`document.querySelector('[data-testid=item3d-problem]').textContent`)).includes(
      'cambia aspetto'
    ),
    'the bow (pulling states) is refused'
  )
  app.check(
    await app.ev(
      `[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.includes('Crea il modello 3D')).disabled`
    ),
    'and cannot be written'
  )
  await app.shot('item3d-bow')
}
