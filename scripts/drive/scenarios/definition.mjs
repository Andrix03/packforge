// 1.2 item definition editor: opens on vanilla's definition, flags broken JSON and errors while
// typing (saving disabled), redraws the item from the text, and saves the pack's own copy.
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

const issues = (app) =>
  app.ev(`document.querySelector('[data-testid=definition-issues]').textContent`)
const saveDisabled = (app) =>
  app.ev(
    `[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.includes('Salva la definizione')).disabled`
  )

export default async function definition(app) {
  await mkdir(join(app.paths.pack, ...ITEM), { recursive: true })
  await writeFile(
    join(app.paths.pack, ...ITEM, 'apple.png'),
    png(16, 16, (x, y) => ((x - 8) ** 2 + (y - 8) ** 2 < 30 ? [200, 30, 40, 255] : [0, 0, 0, 0]))
  )
  await app.openPack({ waitForVanilla: true })
  await openFolder(app, ITEM.join('/'))
  await app.openTexture('apple.png')
  await app.click('Definizione', '.editor button')
  await app.waitFor(`document.querySelector('[aria-label="Testo della definizione"]')`, 10000)
  app.check(
    (
      await app.ev(`document.querySelector('[aria-label="Testo della definizione"]').value`)
    ).includes('minecraft:item/apple'),
    'starts from the vanilla definition'
  )

  await app.setValue('[aria-label="Testo della definizione"]', '{ "model": ')
  await app.sleep(200)
  app.check((await issues(app)).includes('JSON non valido'), 'broken JSON is flagged')
  app.check(await saveDisabled(app), 'and cannot be saved')

  await app.setValue(
    '[aria-label="Testo della definizione"]',
    '{ "model": { "type": "minecraft:wobble" } }'
  )
  await app.sleep(200)
  app.check(await saveDisabled(app), `an unknown model type blocks saving (${await issues(app)})`)

  const edited = {
    model: {
      type: 'minecraft:condition',
      property: 'minecraft:using_item',
      on_true: { type: 'minecraft:model', model: 'minecraft:item/golden_apple' },
      on_false: { type: 'minecraft:model', model: 'minecraft:item/apple' }
    }
  }
  await app.setValue('[aria-label="Testo della definizione"]', JSON.stringify(edited, null, 2))
  await app.waitFor(`document.querySelector('[role=dialog] [aria-label="using_item"]')`)
  app.check(true, 'the preview in the dialog follows the text (using_item switch)')
  app.check((await issues(app)).includes('Nessun problema'), 'a valid definition has no problems')
  await app.shot('definition-dialog')
  await app.click('Salva la definizione', '[role=dialog] button')
  await app.waitFor(`!document.querySelector('[role=dialog]')`, 10000)
  const saved = JSON.parse(
    await readFile(join(app.paths.pack, 'assets', 'minecraft', 'items', 'apple.json'), 'utf8')
  )
  app.check(JSON.stringify(saved) === JSON.stringify(edited), 'the pack gets its own definition')
}
