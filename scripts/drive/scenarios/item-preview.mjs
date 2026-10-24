// 1.2 item preview: an item texture opens with the item drawn through its definition. A bow
// pulling texture opens on the state that shows it (using the item, 13+ ticks); the slider and
// the switch change the models; the display context buttons move between inventory, hand…
import { mkdir, writeFile } from 'node:fs/promises'
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

const models = (app) =>
  app.ev(`document.querySelector('[data-testid=item-models]')?.textContent ?? ''`)

export default async function itemPreview(app) {
  const dir = join(app.paths.pack, ...ITEM)
  await mkdir(dir, { recursive: true })
  // Our own bow stage: a bright diagonal with a string.
  await writeFile(
    join(dir, 'bow_pulling_1.png'),
    png(16, 16, (x, y) =>
      x === y ? [200, 150, 60, 255] : x === 3 && y > 3 ? [240, 240, 240, 255] : [0, 0, 0, 0]
    )
  )

  // Grey leather: drawn with the undyed brown of its definition dye tint.
  await writeFile(
    join(app.paths.pack, ...ITEM, 'leather_helmet.png'),
    png(16, 16, (x, y) =>
      y > 3 && y < 10 && x > 2 && x < 13 ? [200, 200, 200, 255] : [0, 0, 0, 0]
    )
  )
  await app.openPack({ waitForVanilla: true })
  await openFolder(app, ITEM.join('/'))
  await app.openTexture('bow_pulling_1.png')
  await app.waitFor(`document.querySelector('.item-preview')`)
  app.check(
    await app.ev(`!document.querySelector('.editor-side .preview-canvas')`),
    'an item texture gets the item preview, not the 3D block'
  )
  await app.waitFor(
    `document.querySelector('[data-testid=item-models]')?.textContent.includes('bow_pulling_1')`,
    10000
  )
  app.check(
    await app.ev(
      `document.querySelector('[aria-label="using_item"]')?.getAttribute('aria-checked') === 'true'`
    ),
    'it opens on the bow being used'
  )
  await app.sleep(600)
  await app.shot('item-bow-pulling')

  await app.setValue('[aria-label="use_duration"]', '20')
  await app.waitFor(
    `document.querySelector('[data-testid=item-models]').textContent.includes('bow_pulling_2')`
  )
  app.check(true, 'sliding the use time to 20 ticks draws bow_pulling_2')
  await app.ev(`document.querySelector('[aria-label="using_item"]').click()`)
  await app.waitFor(
    `/Modelli: item\\/bow$/.test(document.querySelector('[data-testid=item-models]').textContent)`
  )
  app.check(true, `not using it draws the plain bow (${await models(app)})`)

  await app.click('Prima persona', '.item-preview button')
  await app.sleep(600)
  await app.shot('item-bow-first-person')

  // Painting shows live: back to the stage, paint a pixel.
  await app.ev(`document.querySelector('[aria-label="using_item"]').click()`)
  await app.setValue('[aria-label="use_duration"]', '14')
  await app.click('Inventario', '.item-preview button')
  await app.editor.setHex('#20c0f0')
  await app.editor.draw([
    [8, 2],
    [12, 2]
  ])
  await app.sleep(600)
  await app.shot('item-bow-painted')
  await app.key('s', ['ctrl'])
  await app.sleep(500)
  await tinted(app)
}

export async function tinted(app) {
  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
  await app.openTexture('leather_helmet.png')
  await app.waitFor(
    `document.querySelector('[data-testid=item-models]')?.textContent.includes('leather_helmet')`,
    10000
  )
  await app.sleep(800)
  await app.shot('item-leather-tinted')
}
