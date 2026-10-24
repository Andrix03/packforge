// 1.3 item positions (display transforms): the dialog opens on first person with the item where
// the game puts it, sliders move it live, saving writes the edited entry into the item model in
// the pack (a copy of vanilla's, parent and textures kept).
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

export default async function display(app) {
  await mkdir(join(app.paths.pack, ...ITEM), { recursive: true })
  await writeFile(
    join(app.paths.pack, ...ITEM, 'iron_sword.png'),
    png(16, 16, (x, y) => (x + y === 15 && x > 1 ? [210, 210, 220, 255] : [0, 0, 0, 0]))
  )
  await app.openPack({ waitForVanilla: true })
  await openFolder(app, ITEM.join('/'))
  await app.openTexture('iron_sword.png')
  await app.click('Posizioni', '.editor button')
  await app.waitFor(
    `document.querySelector('[data-testid=display-target]')?.textContent.includes('item/iron_sword')`,
    10000
  )
  app.check(true, 'edits the sword model drawn in first person')
  await app.sleep(800)
  await app.shot('display-first-person')

  await app.setValue('[aria-label="Spostamento (pixel) X"]', '6')
  await app.setValue('[aria-label="Scala Y"]', '1.5')
  await app.sleep(600)
  await app.shot('display-moved')
  await app.click('Inventario', '[role=dialog] button')
  await app.sleep(600)
  await app.shot('display-slot')

  await app.click('Salva le posizioni', '[role=dialog] button')
  await app.waitFor(`!document.querySelector('[role=dialog]')`, 10000)
  const model = JSON.parse(
    await readFile(
      join(app.paths.pack, 'assets', 'minecraft', 'models', 'item', 'iron_sword.json'),
      'utf8'
    )
  )
  const fp = model.display?.firstperson_righthand
  app.check(
    fp?.translation[0] === 6 && fp?.scale[1] === 1.5,
    `the first person entry is saved (${JSON.stringify(fp)})`
  )
  app.check(
    model.parent?.includes('handheld') && model.textures?.layer0?.includes('iron_sword'),
    'the rest of vanilla’s model is kept'
  )
  app.check(!model.display.gui, 'views not touched are not written')
}
