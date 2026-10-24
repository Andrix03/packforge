// 1.3 pixels that pop out: on a full-cube block texture (iron ore) the chosen colours become raised
// cuboids on every face, written as the block's model; the block preview shows them. A block
// whose model is not such a cube (grass block) is refused.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { png } from '../fixtures.mjs'

const BLOCK = ['assets', 'minecraft', 'textures', 'block']
const SPOT = [216, 175, 147, 255]

export default async function popOut(app) {
  // Grey stone with a few tan spots (our own pixels).
  const spots = new Set(['3,4', '4,4', '3,5', '10,9', '11,9', '7,12', '12,2'])
  await writeFile(
    join(app.paths.pack, ...BLOCK, 'iron_ore.png'),
    png(16, 16, (x, y) =>
      spots.has(`${x},${y}`)
        ? SPOT
        : (x * 7 + y * 3) % 5 === 0
          ? [110, 110, 110, 255]
          : [130, 130, 130, 255]
    )
  )

  await app.openPack({ waitForVanilla: true })
  await app.openTexture('iron_ore.png')
  await app.click('Pixel in rilievo', '.editor button')
  await app.waitFor(`document.querySelector('.pop-color')`, 10000)
  app.check(
    (await app.ev(`document.querySelectorAll('.pop-color').length`)) === 3,
    'the texture’s three colours are offered'
  )
  await app.ev(`document.querySelector('.pop-color[title^="#d8af93"]').click()`)
  await app.waitFor(`document.querySelector('[data-testid=pop-plan]')`)
  const plan = await app.ev(`document.querySelector('[data-testid=pop-plan]').textContent`)
  app.check(/\d+ elementi, \d+ facce/.test(plan), `the plan counts the model (${plan})`)
  await app.shot('pop-out-dialog')
  await app.click('Scrivi il modello', '[role=dialog] button')
  await app.waitFor(`!document.querySelector('[role=dialog]')`, 10000)

  const model = JSON.parse(
    await readFile(
      join(app.paths.pack, 'assets', 'minecraft', 'models', 'block', 'iron_ore.json'),
      'utf8'
    )
  )
  // 7 spots → 5 rectangles (two pairs merge… or more), on 6 faces, plus the cube.
  app.check(
    model.textures.all === 'minecraft:block/iron_ore' &&
      model.elements.length > 6 &&
      (model.elements.length - 1) % 6 === 0,
    `the cube plus the same pieces on each of the 6 faces (${model.elements.length} elements)`
  )

  await app.click('Modello del blocco', '.editor-side button')
  await app.sleep(1500)
  await app.shot('pop-out-preview')

  await app.click('Pack', '.shell-tab')
  await app.waitFor(`!document.querySelector('.editor')`)
  await app.openTexture('grass_block_top.png')
  await app.click('Pixel in rilievo', '.editor button')
  await app.waitFor(`document.querySelector('[data-testid=pop-problem]')`, 10000)
  app.check(true, 'grass block top (not a cube of one texture) is refused')
}
