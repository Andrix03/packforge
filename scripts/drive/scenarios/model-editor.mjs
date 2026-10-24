// 1.3 element editor: stone's model inherits its cube from block/cube; the editor copies it in,
// adds a second element, flags an angle 1.21.4 doesn't allow (save disabled), then saves.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const issues = (app) => app.ev(`document.querySelector('[data-testid=model-issues]').textContent`)
const saveDisabled = (app) =>
  app.ev(
    `[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.includes('Salva il modello')).disabled`
  )

export default async function modelEditor(app) {
  await app.openPack({ waitForVanilla: true })
  await app.openTexture('stone.png')
  await app.click('Elementi del modello', '.editor button')
  await app.waitFor(`document.querySelector('.model-list li')`, 10000)
  app.check(
    (await app.ev(`document.querySelectorAll('.model-list li').length`)) === 1,
    'the inherited cube is listed'
  )
  await app.click('Aggiungi', '.model-list button')
  await app.setValue('[aria-label="A Y"]', '8')
  await app.setValue('[aria-label="Da X"]', '4')
  await app.setValue('[aria-label="A X"]', '12')
  await app.setValue('[aria-label="Asse di rotazione"]', 'y')
  await app.setValue('[aria-label="Angolo"]', '30')
  await app.sleep(300)
  app.check(await saveDisabled(app), `an angle 1.21.4 refuses blocks saving (${await issues(app)})`)
  await app.setValue('[aria-label="Angolo"]', '22.5')
  await app.sleep(300)
  app.check(!(await saveDisabled(app)), `22.5° is fine (${await issues(app)})`)
  app.check(
    (await app.ev(`document.querySelector('[data-testid=model-cost]').textContent`)).startsWith(
      '2 elementi'
    ),
    'the cost counts both elements'
  )
  await app.sleep(800)
  await app.shot('model-editor')
  await app.click('Salva il modello', '[role=dialog] button')
  await app.waitFor(`!document.querySelector('[role=dialog]')`, 10000)

  const model = JSON.parse(
    await readFile(
      join(app.paths.pack, 'assets', 'minecraft', 'models', 'block', 'stone.json'),
      'utf8'
    )
  )
  app.check(
    model.parent === 'minecraft:block/cube_all' &&
      model.elements.length === 2 &&
      JSON.stringify(model.elements[1].to) === '[12,8,16]' &&
      model.elements[1].rotation.angle === 22.5,
    'saved with its parent, the copied cube and the new element'
  )
}
